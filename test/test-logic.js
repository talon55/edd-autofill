const assert = require('assert');
const { REQUIRED_COLUMNS, findFirstUnprocessedRow, checkRequiredFields, rowToObject } = require('../src/logic.js');

const HEADERS = [
  'Date of Contact', 'Status', 'Type of Work', 'Employer/Agency Name',
  'Contact Type', 'Outcome', 'Name of Person', 'URL/Email', 'Phone Number',
];

// findFirstUnprocessedRow: skips rows with a non-empty Status
{
  const rows = [
    HEADERS,
    ['2026-07-01', 'Entered',   'Full-time', 'Acme Corp', 'Email', 'Applied', 'Jane', 'hr@acme.com', ''],
    ['2026-07-02', '',          'Full-time', 'Big Corp',  'Phone', 'Applied', 'John', '',             '555-1234'],
  ];
  const result = findFirstUnprocessedRow(rows, HEADERS);
  assert.strictEqual(result.rowIndex, 2,          'should skip Entered rows');
  assert.strictEqual(result.row[3],   'Big Corp',  'should return correct row data');
  console.log('PASS: findFirstUnprocessedRow skips Entered rows');
}

// findFirstUnprocessedRow: returns null when all rows have a Status
{
  const rows = [
    HEADERS,
    ['2026-07-01', 'Entered',   'Full-time', 'Acme Corp', 'Email', 'Applied', 'Jane', 'hr@acme.com', ''],
    ['2026-07-02', 'Submitted', 'Full-time', 'Big Corp',  'Phone', 'Applied', 'John', '',             ''],
  ];
  assert.strictEqual(findFirstUnprocessedRow(rows, HEADERS), null, 'should return null when all processed');
  console.log('PASS: findFirstUnprocessedRow returns null when all rows processed');
}

// findFirstUnprocessedRow: returns null for a sheet with only the header row
{
  assert.strictEqual(findFirstUnprocessedRow([HEADERS], HEADERS), null, 'should return null for header-only sheet');
  console.log('PASS: findFirstUnprocessedRow returns null for header-only sheet');
}

// checkRequiredFields: returns null when all required fields are present
{
  const row = ['2026-07-01', '', 'Full-time', 'Acme Corp', 'Email', 'Applied', '', '', ''];
  assert.strictEqual(checkRequiredFields(row, HEADERS), null, 'should return null when all required fields present');
  console.log('PASS: checkRequiredFields returns null when all required fields present');
}

// checkRequiredFields: returns the name of the first missing required field
{
  const row = ['2026-07-01', '', '', 'Acme Corp', 'Email', 'Applied', '', '', ''];
  assert.strictEqual(checkRequiredFields(row, HEADERS), 'Type of Work', 'should return missing field name');
  console.log('PASS: checkRequiredFields returns name of first missing required field');
}

// checkRequiredFields: treats whitespace-only values as missing
{
  const row = ['2026-07-01', '', 'Full-time', '   ', 'Email', 'Applied', '', '', ''];
  assert.strictEqual(checkRequiredFields(row, HEADERS), 'Employer/Agency Name', 'should treat whitespace as missing');
  console.log('PASS: checkRequiredFields treats whitespace-only as missing');
}

// rowToObject: converts row array to an object keyed by header name
{
  const row = ['2026-07-01', '', 'Full-time', 'Acme Corp', 'Email', 'Applied', 'Jane', 'hr@acme.com', '555-1234'];
  const obj = rowToObject(row, HEADERS);
  assert.strictEqual(obj['Date of Contact'],       '2026-07-01');
  assert.strictEqual(obj['Employer/Agency Name'],  'Acme Corp');
  assert.strictEqual(obj['Phone Number'],          '555-1234');
  assert.strictEqual(obj['Status'],                '');
  console.log('PASS: rowToObject converts row array to object keyed by header');
}

console.log('\nAll tests passed!');
