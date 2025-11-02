#!/usr/bin/env node

/**
 * Cleanup Script for Unused Code
 *
 * This script helps identify and optionally fix unused variables/code
 * that ESLint cannot auto-fix.
 *
 * Usage:
 *   node cleanup-unused.js --dry-run   # Show what would be changed
 *   node cleanup-unused.js --fix       # Apply the fixes
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--fix');

console.log(DRY_RUN ? '🔍 DRY RUN MODE - No changes will be made\n' : '🔧 FIX MODE - Applying changes\n');

const fixes = [
  {
    file: 'js/components/photos.js',
    description: 'Remove unused touch tracking variables',
    pattern: /let touchStartY = 0;\s*let touchStartX = 0;\s*let isDragging = false;/,
    replacement: '// Touch tracking removed - was unused'
  },
  {
    file: 'js/features/itemEditor.js',
    description: 'Remove unused isIOS variable',
    pattern: /const isIOS = \/iPad\|iPhone\|iPod\/\.test\(navigator\.userAgent\);/,
    replacement: ''
  },
  {
    file: 'js/features/itemEditor.js',
    description: 'Remove unused itemId assignment',
    pattern: /itemId = newItemId;/,
    replacement: '// itemId assignment removed - was unused'
  },
  {
    file: 'js/updateManager.js',
    description: 'Remove unused UPDATE_CHECK_KEY constant',
    pattern: /const UPDATE_CHECK_KEY = .*?;/,
    replacement: ''
  },
  {
    file: 'js/components/placeMapFilter.js',
    description: 'Remove unused marker variable',
    pattern: /let marker = .*?;/,
    replacement: ''
  },
  {
    file: 'js/components/placeMapFilter.js',
    description: 'Remove unused originalInnerHTML variable',
    pattern: /const originalInnerHTML = .*?;/,
    replacement: ''
  },
  {
    file: 'js/components/map.js',
    description: 'Remove unused tilesLoaded variable',
    pattern: /let tilesLoaded = false;/,
    replacement: ''
  },
  {
    file: 'js/db.js',
    description: 'Remove unused id variable assignment',
    pattern: /const id = .*?;(\s*\/\/.*)?$/m,
    replacement: ''
  }
];

let totalChanges = 0;

for (const fix of fixes) {
  const filePath = path.join(process.cwd(), fix.file);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${fix.file}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;

  if (fix.pattern.test(content)) {
    content = content.replace(fix.pattern, fix.replacement);

    if (DRY_RUN) {
      console.log(`✓ Would fix: ${fix.description}`);
      console.log(`  File: ${fix.file}\n`);
    } else {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✓ Fixed: ${fix.description}`);
      console.log(`  File: ${fix.file}\n`);
      totalChanges++;
    }
  } else {
    console.log(`ℹ️  Already fixed or pattern not found: ${fix.description}`);
    console.log(`  File: ${fix.file}\n`);
  }
}

if (DRY_RUN) {
  console.log('\n📝 Summary: Run with --fix to apply changes');
  console.log('   Example: node cleanup-unused.js --fix');
} else {
  console.log(`\n✅ Complete! Applied ${totalChanges} fixes.`);
  console.log('   Run "npm run lint" to verify.');
}

