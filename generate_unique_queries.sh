#!/bin/bash

# This script extracts unique queries with consistencyRating < 100 from a JSON file.
# Usage: ./generate_unique_queries.sh <input_filename>

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <input_filename>"
  exit 1
fi

INPUT_FILE="$1"
OUTPUT_DIR="results/json"
OUTPUT_FILE="$OUTPUT_DIR/unique_queries_output.json"

if [ ! -f "$INPUT_FILE" ]; then
  echo "Error: File '$INPUT_FILE' not found!"
  exit 1
fi

# Ensure the output directory exists
mkdir -p "$OUTPUT_DIR"

# Extract unique queries with consistencyRating < 100 and ignore those without consistencyRating
jq '[.[] | select(.consistencyRating and .consistencyRating < 100)] | unique_by(.query)' "$INPUT_FILE" > "$OUTPUT_FILE"

if [ $? -eq 0 ]; then
  COUNT=$(jq '. | length' "$OUTPUT_FILE")
  echo "Unique queries with consistencyRating < 100 have been saved to '$OUTPUT_FILE'."
  echo "Count of unique queries: $COUNT"
  echo "Queries:"
  jq -r '.[] | .query' "$OUTPUT_FILE"
else
  echo "An error occurred while processing the file."
  exit 1
fi