const REQUIRED_COLUMNS = [
  'Date of Contact',
  'Type of Work',
  'Employer/Agency Name',
  'Contact Type',
];

function findFirstUnprocessedRow(rows, headers) {
  const statusIdx = headers.indexOf('Status');
  for (let i = 1; i < rows.length; i++) {
    if (!(rows[i][statusIdx] || '').trim()) return { row: rows[i], rowIndex: i };
  }
  return null;
}

function checkRequiredFields(row, headers) {
  for (const colName of REQUIRED_COLUMNS) {
    const idx = headers.indexOf(colName);
    if (idx === -1 || !(row[idx] || '').trim()) return colName;
  }
  return null;
}

function rowToObject(row, headers) {
  return Object.fromEntries(headers.map((h, i) => [h, row[i] || '']));
}

if (typeof module !== 'undefined') {
  module.exports = { REQUIRED_COLUMNS, findFirstUnprocessedRow, checkRequiredFields, rowToObject };
}
