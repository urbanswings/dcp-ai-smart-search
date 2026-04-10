#!/bin/bash

# Consolidate screenshot folders by test type
# Changes from: testType_HHmm/*.png
# To: testType/*_HHmm_*.png

cd "$(dirname "$0")/results/screenshots" || exit 1

echo "🔄 Consolidating screenshot folders by test type..."
echo ""

# Process each date folder
for date_folder in */; do
  if [[ ! -d "$date_folder" ]]; then continue; fi
  
  echo "Processing: $date_folder"
  cd "$date_folder" || continue
  
  # Group folders by test type
  declare -A test_types
  
  # First pass: identify test types
  for folder in */; do
    if [[ ! -d "$folder" ]]; then continue; fi
    
    # Extract test type (everything before the last underscore and timestamp)
    folder_name="${folder%/}"
    if [[ "$folder_name" =~ ^(.+)_([0-9]{4})$ ]]; then
      test_type="${BASH_REMATCH[1]}"
      timestamp="${BASH_REMATCH[2]}"
      test_types[$test_type]=1
      
      echo "  Found: $folder → test type: $test_type, time: $timestamp"
    fi
  done
  
  echo ""
  echo "  Test types found: ${!test_types[@]}"
  echo ""
  
  # Second pass: consolidate files
  for test_type in "${!test_types[@]}"; do
    target_folder="$test_type"
    mkdir -p "$target_folder"
    
    # Find all folders for this test type
    for folder in ${test_type}_*/; do
      if [[ ! -d "$folder" ]]; then continue; fi
      
      folder_name="${folder%/}"
      # Extract timestamp from folder name
      if [[ "$folder_name" =~ ^${test_type}_([0-9]{4})$ ]]; then
        timestamp="${BASH_REMATCH[1]}"
        
        # Move and rename files
        for file in "$folder"*.png; do
          if [[ ! -f "$file" ]]; then continue; fi
          
          filename=$(basename "$file")
          # Insert timestamp before query number
          # From: TR_NCOS_testType_query-1_xxx.png
          # To:   TR_NCOS_testType_HHmm_query-1_xxx.png
          new_filename="${filename/_query-/_${timestamp}_query-}"
          
          mv "$file" "$target_folder/$new_filename"
          echo "    ✓ Moved: $filename → $target_folder/$new_filename"
        done
        
        # Remove empty folder
        rmdir "$folder" 2>/dev/null && echo "    🗑️  Removed: $folder"
      fi
    done
    
    echo ""
  done
  
  cd ..
done

echo ""
echo "✅ Consolidation complete!"
echo ""
echo "📁 New structure:"
ls -d */*/  2>/dev/null | while read dir; do
  count=$(find "$dir" -name "*.png" 2>/dev/null | wc -l)
  printf "   %-50s %3d screenshots\n" "$dir" "$count"
done
