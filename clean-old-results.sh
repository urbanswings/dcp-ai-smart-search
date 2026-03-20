#!/bin/bash
# Clean old test results - keep only the most recent files

echo "Cleaning old test results..."

# Clean old HTML results (keep last 5)
cd results/html
ls -t | tail -n +6 | xargs -I {} rm -v {}
cd ../..

# Clean old JSON results (keep last 10)
cd results/json
ls -t | tail -n +11 | xargs -I {} rm -v {}
cd ../..

# Clean old screenshot folders (keep last 3 date folders)
if [ -d "results/screenshots" ]; then
  cd results/screenshots
  # Find and remove old date folders, keeping only the 3 most recent
  ls -dt */ 2>/dev/null | tail -n +4 | xargs -I {} rm -rfv {}
  cd ../..
fi

echo "Cleanup complete!"
echo "Current results:"
echo "HTML files: $(find results/html -type f 2>/dev/null | wc -l)"
echo "JSON files: $(find results/json -type f 2>/dev/null | wc -l)"
echo "Screenshot folders: $(find results/screenshots -mindepth 2 -maxdepth 2 -type d 2>/dev/null | wc -l)"
echo "Screenshot images: $(find results/screenshots -type f -name '*.png' 2>/dev/null | wc -l)"
echo "Total size: $(du -sh results/ 2>/dev/null)"
