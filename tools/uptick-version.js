import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const indexHtmlPath = path.resolve('src/lib/legacy/vanguard/index.html');

try {
  // Check if index.html is staged for commit
  const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
  const isStaged = stagedFiles.split('\n').some(file => file.trim() === 'src/lib/legacy/vanguard/index.html');

  if (isStaged) {
    console.log('[vanguard-version-uptick] Vanguard changes detected. Upticking version...');
    let content = fs.readFileSync(indexHtmlPath, 'utf-8');
    
    // Match const VERSION='182';
    const versionRegex = /(const\s+VERSION\s*=\s*')(\d+)(';)/;
    const match = content.match(versionRegex);
    
    if (match) {
      const oldVersion = parseInt(match[2], 10);
      const newVersion = oldVersion + 1;
      content = content.replace(versionRegex, `$1${newVersion}$3`);
      fs.writeFileSync(indexHtmlPath, content, 'utf-8');
      
      // Stage the updated index.html
      execSync(`git add "${indexHtmlPath}"`);
      console.log(`[vanguard-version-uptick] Successfully upticked VERSION from ${oldVersion} to ${newVersion}.`);
    } else {
      console.error('[vanguard-version-uptick] Error: Could not find VERSION declaration in index.html.');
    }
  }
} catch (error) {
  console.error('[vanguard-version-uptick] Error running uptick-version script:', error.message);
}
