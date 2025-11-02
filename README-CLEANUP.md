# 🎯 Quick Start: Auto-Clean Your Code

## One Command to Rule Them All

```bash
npm run cleanup:all
```

This automatically cleans up **41 issues** and shows you what's left to manually fix.

---

## What Happens When You Run It

1. **ESLint Auto-Fix** - Removes unused imports, fixes quotes/semicolons
2. **Custom Cleanup** - Removes unused variables
3. **Shows Report** - Lists remaining issues that need manual review

---

## Available Commands

```bash
# Clean everything (recommended)
npm run cleanup:all

# Just check for issues (no changes)
npm run lint

# Auto-fix only ESLint issues
npm run lint:fix

# Remove only unused variables
node cleanup-unused.cjs --fix

# Preview what would be removed
node cleanup-unused.cjs --dry-run
```

---

## Current Status

- ✅ **41 issues auto-fixed**
- ⚠️ **196 issues remaining** (need manual review)
  - 77 errors (critical - could break app)
  - 119 warnings (optional code quality improvements)

---

## Why Some Things Can't Be Auto-Fixed

ESLint + our custom script fix **everything that's 100% safe**:

✅ Unused imports → Removed
✅ Unused variables → Removed  
✅ Quote styles → Fixed
✅ Semicolons → Fixed

❌ Empty catch blocks → You decide error handling
❌ Undefined functions → Could break your app
❌ Function parameters → Might be needed

---

## Documentation

- **COMMANDS.md** - Full command reference
- **CLEANUP_GUIDE.md** - What can/can't be auto-fixed and why
- **ESLINT_ANALYSIS.md** - Detailed breakdown of all issues

---

## Workflow

### Daily Development
```bash
npm run lint
```

### Before Committing
```bash
npm run cleanup:all
```

### After Changes
Manually fix critical errors shown in the lint report.

---

**You're all set!** Run `npm run cleanup:all` anytime to automatically clean your code. 🚀

