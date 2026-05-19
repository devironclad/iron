const XLSX = require('xlsx');

try {
  const workbook = XLSX.readFile('import-auctions.xlsx');
  const sheetNames = workbook.SheetNames;
  console.log('=== Excel Verification ===');
  console.log('Sheet Names found:', sheetNames);
  
  const firstSheet = workbook.Sheets[sheetNames[0]];
  const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
  
  if (data.length === 0) {
    console.log('The first sheet is empty!');
  } else {
    console.log('\n=== Planilha Headers (Cabecalhos) ===');
    console.log(JSON.stringify(data[0], null, 2));
    
    console.log('\n=== Row Count (Quantidade de Linhas) ===');
    console.log(data.length - 1, 'records');
    
    console.log('\n=== Sample Data (Primeiras 2 linhas de dados) ===');
    const sample = data.slice(1, 3).map((row) => {
      const obj = {};
      data[0].forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
    console.log(JSON.stringify(sample, null, 2));
  }
} catch (err) {
  console.error('Error reading excel file:', err);
}
