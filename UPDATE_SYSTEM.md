# PWA Update System Documentation

## Overview

The GourmetApp now has a complete PWA update system that automatically notifies users when a new version is available. Users can choose to update immediately, postpone, or skip a specific version.

## How It Works

### Version Management

1. **Version Storage**: The app version is defined in two places:
   - `sw.js`: The `VERSION` constant (line 5)
   - `version.json`: The version file with release information

2. **Update Detection**: The app checks for updates:
   - On app startup
   - When the app becomes visible (user returns to the app)
   - Every 30 minutes while the app is running
   - When a new service worker is detected

3. **User Notification**: When an update is available, a banner appears at the top of the screen with:
   - Version number
   - What's new (from `version.json`)
   - Three action buttons:
     - **Update**: Applies the update and reloads the app
     - **Not now**: Dismisses the banner (will show again later)
     - **Skip this version**: Never shows this version's update banner again

## How to Trigger an Update

To release a new version and trigger the update notification for users, follow these steps:

### Step 1: Update the Version Number

Edit `sw.js` and change the VERSION constant:

```javascript
const VERSION = '1.0.1'; // Change from '1.0.0' to '1.0.1'
```

### Step 2: Update version.json

Edit `version.json` with the new version details:

```json
{
  "version": "1.0.1",
  "releaseDate": "2025-10-24",
  "changes": [
    "Fixed bug in barcode scanning",
    "Improved offline performance",
    "Added new pairing suggestions"
  ]
}
```

**Important**: The version number in `version.json` must match the VERSION in `sw.js`!

### Step 3: Deploy the Changes

Upload all updated files to your web server. This includes:
- `sw.js` (with new VERSION)
- `version.json` (with new version info)
- Any other files you changed

### Step 4: Users Get Notified

When users open the app:
1. The service worker detects the new version
2. The update banner appears automatically
3. Users can choose to update or skip

## Update Process Flow

```
1. User opens app
   ↓
2. Service worker checks for updates
   ↓
3. New version detected?
   ↓ YES
4. Fetch version.json
   ↓
5. Compare with current version
   ↓
6. Check if user skipped this version
   ↓ NO
7. Show update banner
   ↓
8. User clicks "Update"
   ↓
9. Clear caches
   ↓
10. Reload app with new version
```

## Testing Updates Locally

### Test Scenario 1: First Update

1. Open the app (version will be saved as 1.0.0)
2. Close the app
3. Change VERSION in `sw.js` to '1.0.1'
4. Update `version.json` to version 1.0.1
5. Refresh the page
6. **Expected**: Update banner appears

### Test Scenario 2: Skip Version

1. When update banner appears, click "Skip this version"
2. Refresh the page
3. **Expected**: Banner does not appear (version 1.0.1 is skipped)
4. Change to version 1.0.2
5. **Expected**: Banner appears for 1.0.2

### Test Scenario 3: Not Now

1. When update banner appears, click "Not now"
2. Refresh the page or wait
3. **Expected**: Banner appears again (update not skipped)

## Version Numbering Best Practices

Use semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR** (1.x.x): Breaking changes or major features
- **MINOR** (x.1.x): New features, backward compatible
- **PATCH** (x.x.1): Bug fixes, small improvements

Examples:
- `1.0.0` → `1.0.1`: Bug fix
- `1.0.1` → `1.1.0`: New feature added
- `1.1.0` → `2.0.0`: Major redesign

## Important Notes

### For iOS Users (Home Screen Apps)

iOS caches PWAs aggressively. The update system handles this by:
- Checking for updates when the app becomes visible
- Clearing all caches before reload
- Using cache-busting for version.json (`?t=timestamp`)

### Service Worker Updates

The service worker automatically:
- Installs in the background when updated
- Waits for user confirmation before activating
- Deletes old caches after activation
- Claims all clients after activation

### localStorage Keys Used

The update system stores:
- `gourmetapp_current_version`: The currently installed version
- `gourmetapp_skipped_version`: Version the user chose to skip
- `gourmetapp_last_update_check`: Timestamp of last check (unused, reserved for future use)

## Troubleshooting

### Update Banner Not Appearing

**Check**:
1. VERSION in `sw.js` matches `version.json`
2. Both files are properly deployed
3. User hasn't skipped this version (check localStorage)
4. Service worker is registered (check browser console)

**Solution**:
```javascript
// Force clear localStorage (in browser console)
localStorage.removeItem('gourmetapp_skipped_version');
localStorage.removeItem('gourmetapp_current_version');
```

### Service Worker Not Updating

**Check**:
1. Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
2. Unregister service worker in DevTools
3. Check browser console for errors

**Solution**:
```javascript
// Unregister service worker (in browser console)
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(r => r.unregister());
});
```

### iOS Not Updating

For iOS home screen apps:
1. Close the app completely (swipe up)
2. Wait 10 seconds
3. Open the app again
4. Update banner should appear

If still not working:
1. Remove app from home screen
2. Clear Safari cache
3. Add app to home screen again

## Advanced: Manual Update Check

You can force an update check programmatically:

```javascript
import { forceUpdateCheck } from './updateManager.js';

// Call this to force check for updates
await forceUpdateCheck();
```

## Files Modified

1. **New Files Created**:
   - `js/updateManager.js`: Update detection and banner logic
   - `css/features/update-banner.css`: Banner styling
   - `version.json`: Version information

2. **Modified Files**:
   - `sw.js`: Added VERSION constant and version.json to cache
   - `js/app.js`: Integrated updateManager
   - `index.html`: Added update-banner.css

## Quick Reference

**To release a new version:**
1. Increment VERSION in `sw.js`
2. Update `version.json` with same version number
3. Deploy files
4. Users see update banner automatically

**Version must match in both files or updates won't work correctly!**

