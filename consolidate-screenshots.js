const fs = require('fs');
const path = require('path');

/**
 * Consolidate screenshot folders by test type
 * From: testType_HHmm/*.png
 * To: testType/*_HHmm_*.png
 */
function consolidateScreenshots() {
  const screenshotsBase = path.join(__dirname, 'results', 'screenshots');
  
  if (!fs.existsSync(screenshotsBase)) {
    console.error('Screenshots directory not found');
    return;
  }
  
  console.log('🔄 Consolidating screenshot folders by test type...\n');
  
  // Get all date folders
  const dateFolders = fs.readdirSync(screenshotsBase)
    .filter(f => fs.statSync(path.join(screenshotsBase, f)).isDirectory());
  
  for (const dateFolder of dateFolders) {
    const datePath = path.join(screenshotsBase, dateFolder);
    console.log(`Processing: ${dateFolder}`);
    
    // Get all subdirectories
    const subFolders = fs.readdirSync(datePath)
      .filter(f => fs.statSync(path.join(datePath, f)).isDirectory());
    
    // Group folders by test type
    const testTypeGroups = {};
    
    subFolders.forEach(folder => {
      // Match pattern: testType_HHmm
      const match = folder.match(/^(.+)_(\d{4})$/);
      if (match) {
        const testType = match[1];
        const timestamp = match[2];
        
        if (!testTypeGroups[testType]) {
          testTypeGroups[testType] = [];
        }
        testTypeGroups[testType].push({ folder, timestamp });
        console.log(`  Found: ${folder} → type: ${testType}, time: ${timestamp}`);
      }
    });
    
    console.log(`\n  Test types found: ${Object.keys(testTypeGroups).join(', ')}\n`);
    
    // Consolidate each test type
    for (const [testType, folders] of Object.entries(testTypeGroups)) {
      const targetFolder = path.join(datePath, testType);
      
      // Create target folder if it doesn't exist
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }
      
      // Process each timestamped folder
      folders.forEach(({ folder, timestamp }) => {
        const sourcePath = path.join(datePath, folder);
        const files = fs.readdirSync(sourcePath).filter(f => f.endsWith('.png'));
        
        files.forEach(file => {
          // Insert timestamp into filename before query number
          // From: TR_NCOS_testType_query-1_xxx.png
          // To:   TR_NCOS_testType_HHmm_query-1_xxx.png
          const newFilename = file.replace(/_query-/, `_${timestamp}_query-`);
          
          const sourceFile = path.join(sourcePath, file);
          const targetFile = path.join(targetFolder, newFilename);
          
          fs.renameSync(sourceFile, targetFile);
          console.log(`    ✓ ${file} → ${testType}/${newFilename}`);
        });
        
        // Remove empty source folder
        try {
          fs.rmdirSync(sourcePath);
          console.log(`    🗑️  Removed: ${folder}/`);
        } catch (err) {
          // Folder not empty or error, ignore
        }
      });
      
      console.log('');
    }
  }
  
  console.log('✅ Consolidation complete!\n');
  console.log('📁 Final structure:');
  
  // Show final structure
  dateFolders.forEach(dateFolder => {
    const datePath = path.join(screenshotsBase, dateFolder);
    const testTypeFolders = fs.readdirSync(datePath)
      .filter(f => fs.statSync(path.join(datePath, f)).isDirectory())
      .sort();
    
    testTypeFolders.forEach(folder => {
      const folderPath = path.join(datePath, folder);
      const count = fs.readdirSync(folderPath).filter(f => f.endsWith('.png')).length;
      console.log(`   ${dateFolder}/${folder.padEnd(35)} ${count} screenshots`);
    });
  });
}

consolidateScreenshots();
