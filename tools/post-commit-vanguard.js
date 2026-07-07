import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const indexHtmlPath = path.resolve('src/lib/legacy/vanguard/index.html');

try {
  // Get list of changed files in the latest commit
  const commitFiles = execSync('git diff-tree --no-commit-id --name-only -r HEAD', { encoding: 'utf-8' });
  const filesList = commitFiles.split('\n').map(f => f.trim()).filter(Boolean);

  // Check if any file is in Vanguard scope
  const hasVanguardChanges = filesList.some(file => 
    file.startsWith('src/lib/legacy/vanguard/') || 
    file.startsWith('src/routes/vanguard/')
  );

  if (hasVanguardChanges) {
    console.log('[vanguard-updater] Vanguard changes detected. Processing version uptick and changelog...');

    // Get the latest commit message
    const commitMsg = execSync('git log -1 --pretty=%B', { encoding: 'utf-8' });
    const firstLine = commitMsg.split('\n')[0].trim();

    // Read index.html
    let content = fs.readFileSync(indexHtmlPath, 'utf-8');

    // 1. Parse and uptick VERSION
    const versionRegex = /(const\s+VERSION\s*=\s*')(\d+)(';)/;
    const match = content.match(versionRegex);

    if (match) {
      const oldVersion = parseInt(match[2], 10);
      const newVersion = oldVersion + 1;

      // Update VERSION constant
      content = content.replace(versionRegex, `$1${newVersion}$3`);

      // 2. Prepend entry to CHANGELOG
      const changelogRegex = /(const\s+CHANGELOG\s*=\s*\[\s*\n)/;
      const cleanSubject = firstLine.replace(/'/g, "\\'");
      const year = new Date().getFullYear();
      const newChangelogEntry = ` {ver:'${newVersion}',date:'${year}',items:['${cleanSubject}']},\n`;

      if (changelogRegex.test(content)) {
        content = content.replace(changelogRegex, `$1${newChangelogEntry}`);
        fs.writeFileSync(indexHtmlPath, content, 'utf-8');

        console.log(`[vanguard-updater] Upticked VERSION to ${newVersion} and added CHANGELOG entry: "${firstLine}"`);

        // Stage and amend the commit
        execSync(`git add "${indexHtmlPath}"`);
        execSync('git commit --amend -C HEAD --no-verify');
        console.log('[vanguard-updater] Commit successfully amended with updated version and changelog.');
      } else {
        console.error('[vanguard-updater] Error: Could not find CHANGELOG array in index.html.');
      }
    } else {
      console.error('[vanguard-updater] Error: Could not find VERSION declaration in index.html.');
    }
  }
} catch (error) {
  console.error('[vanguard-updater] Error during post-commit update:', error.message);
}
