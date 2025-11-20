#!/bin/bash
# Clean old test results - keep only the 5 most recent files

echo "Cleaning old test results..."

# Clean old HTML results (keep last 5)
cd results/html
ls -t | tail -n +6 | xargs -I {} rm -v {}
cd ../..

# Clean old JSON results (keep last 10)
cd results/json
ls -t | tail -n +11 | xargs -I {} rm -v {}
cd ../..

echo "Cleanup complete!"
echo "Current results:"
echo "HTML files: $(find results/html -type f | wc -l)"
echo "JSON files: $(find results/json -type f | wc -l)"
echo "Total size: $(du -sh results/)"
