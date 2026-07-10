#!/usr/bin/env python3
"""
Migrate test result JSON files from old schema to new structured schema.

Old schema has flat structure with duplicated counts and nested facets.
New schema separates metadata, request, response, assertions, and summary.

Usage:
  python3 migrate-results-schema.py [--dry-run] [--backup]
"""

import json
import sys
import glob
from pathlib import Path
from datetime import datetime
import argparse

def extract_motorization_from_actual_facets(actual_facets):
    """Extract detected models from actual facets if available."""
    if not actual_facets:
        return []
    return actual_facets.get("motorization", [])

def build_new_structure(old_obj):
    """Transform old result structure to new schema."""
    
    # Extract test config
    test_suite = old_obj.get("testDescribe", "")
    test_case = old_obj.get("testTitle", "")
    
    # Extract expected facets (flatten the nested structure)
    expected_facets = old_obj.get("facets", {}).get("expected", {})
    expected_include = {}
    expected_exclude = {}
    
    # Process include facets
    for facet_spec in expected_facets.get("include", []):
        for facet_name, facet_values in facet_spec.items():
            if facet_values:  # Skip empty arrays
                expected_include[facet_name] = facet_values
    
    # Process exclude facets
    for facet_spec in expected_facets.get("exclude", []):
        for facet_name, facet_values in facet_spec.items():
            if facet_values:  # Skip empty arrays
                expected_exclude[facet_name] = facet_values
    
    # Extract actual facets
    actual_facets = old_obj.get("facets", {}).get("actual", {})
    
    # Build facets assertions
    facets_status = old_obj.get("results", {}).get("facetsResult", "UNKNOWN")
    facets_failures = old_obj.get("facets", {}).get("failureReasons", [])
    
    # Parse facet failures into structured format
    facet_failures_list = []
    for failure_reason in facets_failures:
        # Try to parse failure reason strings like:
        # "Unexpected facet value in motorization: C 220 d 4MATIC (expected only: C 220 d)"
        if "Unexpected facet value in" in failure_reason:
            parts = failure_reason.split(":")
            if len(parts) >= 2:
                facet_name = parts[1].strip().split()[0]
                unexpected_val = parts[1].strip().split()[-1]
                expected_str = parts[-1]
                facet_failures_list.append({
                    "facet": facet_name,
                    "issue": "Unexpected value in response",
                    "details": failure_reason
                })
    
    # Build response data
    response_data = {
        "resultCount": old_obj.get("resultCount"),
        "vehicleTotalCount": old_obj.get("responseVehicleTotalCount"),
    }
    
    # Add detected models if available
    motorization = old_obj.get("motorization", [])
    if motorization:
        response_data["detectedModels"] = motorization
    
    # Build count assertion
    count_assertion = {
        "expected": expected_include.get("resultCount") if expected_include.get("resultCount") else None,
        "actual": old_obj.get("resultCount"),
        "status": old_obj.get("results", {}).get("countResult", "UNKNOWN")
    }
    
    # Add backend count if available (for comparison)
    backend_count = old_obj.get("results", {}).get("backendResultCount")
    if backend_count is not None:
        count_assertion["backendCount"] = backend_count
    
    # Parse openaiEvaluation for response assertion
    response_assertion = {
        "status": old_obj.get("results", {}).get("responseResult", "UNKNOWN"),
    }
    
    openai_eval = old_obj.get("openaiEvaluation", "")
    if openai_eval:
        response_assertion["feedback"] = openai_eval
    
    # Build new structure
    new_obj = {
        "metadata": {
            "timestamp": old_obj.get("timestamp"),
            "timestampSG": old_obj.get("timestampSG"),
            "testMode": old_obj.get("testMode"),
            "testSuite": test_suite,
            "testCase": test_case,
        },
        "request": {
            "query": old_obj.get("query", {})
        },
        "response": {
            "statusCode": old_obj.get("statusCode"),
            "responseTime": old_obj.get("responseTime"),
            "message": old_obj.get("response", {}),
            "data": response_data
        },
        "assertions": {
            "facets": {
                "expected": {
                    "include": expected_include,
                    "exclude": expected_exclude
                },
                "actual": actual_facets,
                "status": facets_status,
            },
            "count": count_assertion,
            "response": response_assertion
        },
        "summary": {
            "overallStatus": "FAIL" if old_obj.get("hasError") else "PASS",
            "hasError": old_obj.get("hasError", False),
        }
    }
    
    # Add failure reasons to summary if present
    failure_reasons = []
    if facets_failures:
        failure_reasons.extend(facets_failures)
    if openai_eval and "FAIL" in openai_eval:
        failure_reasons.append(openai_eval)
    
    if failure_reasons:
        new_obj["summary"]["failureReasons"] = failure_reasons
    
    # Add structured facet failures if any
    if facet_failures_list:
        new_obj["assertions"]["facets"]["failures"] = facet_failures_list
    
    return new_obj

def migrate_file(file_path, dry_run=False, backup=False):
    """Migrate a single result file."""
    try:
        file_path = Path(file_path)
        with open(file_path, 'r', encoding='utf-8') as f:
            old_data = json.load(f)
        
        # Handle both single objects and arrays
        if isinstance(old_data, list):
            new_data = [build_new_structure(item) for item in old_data]
        else:
            new_data = build_new_structure(old_data)
        
        if dry_run:
            print(f"[DRY-RUN] Would migrate: {file_path}")
            return True
        
        # Create backup if requested
        if backup:
            backup_path = Path(str(file_path) + ".backup")
            with open(backup_path, 'w', encoding='utf-8') as f:
                json.dump(old_data, f, indent=2, ensure_ascii=False)
            print(f"  Backed up to: {backup_path}")
        
        # Write new structure
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(new_data, f, indent=2, ensure_ascii=False)
        
        print(f"✓ Migrated: {file_path}")
        return True
    
    except json.JSONDecodeError as e:
        print(f"✗ JSON error in {file_path}: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"✗ Error migrating {file_path}: {e}", file=sys.stderr)
        return False

def main():
    parser = argparse.ArgumentParser(description="Migrate test result JSON files to new schema")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be migrated without making changes")
    parser.add_argument("--backup", action="store_true", help="Create .backup files before migrating")
    parser.add_argument("--dir", default="/Users/ajid/DevWork/MB/VX.SmartSearchAssistant.TestAutomation/results/json",
                       help="Directory containing result files to migrate")
    parser.add_argument("--pattern", default="**/*.json", help="Glob pattern for files to migrate")
    
    args = parser.parse_args()
    
    # Find all result files (excluding rate-limit folder)
    result_dir = Path(args.dir)
    files = [f for f in result_dir.glob(args.pattern) 
             if 'rate-limit' not in str(f)]  # Skip rate-limit tests
    
    if not files:
        print(f"No files found matching pattern: {args.pattern}")
        return 1
    
    print(f"Found {len(files)} files to migrate")
    if args.dry_run:
        print("[DRY-RUN MODE - No changes will be made]")
    if args.backup:
        print("[BACKUP MODE - Original files will be saved as .backup]")
    print()
    
    success_count = 0
    fail_count = 0
    
    for file_path in sorted(files):
        if migrate_file(file_path, dry_run=args.dry_run, backup=args.backup):
            success_count += 1
        else:
            fail_count += 1
    
    print(f"\n{'='*60}")
    print(f"Migration complete: {success_count} succeeded, {fail_count} failed")
    
    return 0 if fail_count == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
