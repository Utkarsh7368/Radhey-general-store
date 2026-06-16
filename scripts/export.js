const fs = require('fs');
const path = require('path');

const localCatalogPath = path.join(__dirname, '../data/local_catalog.json');

try {
  const data = JSON.parse(fs.readFileSync(localCatalogPath, 'utf-8'));

  // 1. Export Categories CSV
  let categoriesCsv = 'CategoryID,CategoryName,CategoryEmoji,Active\n';
  data.categories.forEach(cat => {
    categoriesCsv += `"${cat.CategoryID}","${cat.CategoryName}","${cat.CategoryEmoji}","${cat.Active}"\n`;
  });
  fs.writeFileSync(path.join(__dirname, '../data/Categories.csv'), categoriesCsv);
  console.log('✅ Generated data/Categories.csv');

  // 2. Export Products CSV
  let productsCsv = 'ProductID,CategoryID,ProductName,VariantName,Price,Stock,Active\n';
  data.products.forEach(prod => {
    productsCsv += `"${prod.ProductID}","${prod.CategoryID}","${prod.ProductName}","${prod.VariantName}","${prod.Price}","${prod.Stock}","${prod.Active}"\n`;
  });
  fs.writeFileSync(path.join(__dirname, '../data/Products.csv'), productsCsv);
  console.log('✅ Generated data/Products.csv');

} catch (err) {
  console.error('❌ Failed to export CSV:', err);
}
