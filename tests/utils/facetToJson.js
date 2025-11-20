const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, 'search-api-response-ncos.json');
const outputPath = path.join(__dirname, 'facets-ncos.json');

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const facets = data.facets;

function extractSimpleValues(values) {
  if (!Array.isArray(values)) return [];
  return values.map(v => {
    if (v.code && v.name) {
      return { code: v.code, name: v.name };
    }
    // If nested, try to find code/name inside
    if (Array.isArray(v.values)) {
      return v.values.map(inner => ({ code: inner.code, name: inner.name })).filter(x => x.code && x.name);
    }
    return null;
  }).flat().filter(x => x && x.code && x.name);
}

const result = facets.map(facet => {
  const { code, min, max, values, displayName } = facet;
  let type;
  if (typeof min !== 'undefined' && typeof max !== 'undefined') {
    type = 'range';
    return { code, type, min: parseFloat(Number(min).toFixed(1)), max: parseFloat(Number(max).toFixed(1)), displayName };
  } else {
    type = 'list';
    return { code, type, values: extractSimpleValues(values), displayName };
  }
});

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
console.log(`Facets extracted to ${outputPath}`);