---
title: How to Remove Location Data (GPS) From iPhone Photos
metaTitle: 'How to Remove Location Data (GPS) From iPhone Photos | NoWatermark'
description: Learn how to strip GPS location coordinates from iPhone photos on iOS or in your browser losslessly without causing sideways photo orientation bugs.
summary: iPhones attach precise GPS coordinates to every photo — learn how to strip location data natively on iOS or losslessly using a local browser tool.
publishDate: 2026-08-14
order: 34
relatedTools: ['/exif-remover', '/ai-metadata-remover']
relatedGuides: ['/guides/how-to-remove-exif-data']
faq:
  - q: Does iPhone automatically remove GPS location when emailing photos?
    a: No. Emailing a photo directly from iOS attaches full EXIF data, including GPS coordinates, unless disabled in the Options menu of the Share Sheet.
  - q: Why did my iPhone photo turn sideways after removing EXIF data?
    a: iPhones store physical camera orientation as an EXIF tag rather than rotating raw pixels. Naive EXIF removers strip all tags including orientation. NoWatermark's EXIF Remover preserves the orientation tag by default so portrait photos stay upright.
  - q: Does turning off Location Services for Camera delete location from past photos?
    a: No. Disabling location services prevents GPS tagging on future photos, but past photos retain their stored coordinates.
---

Every time you take a photo with your iPhone, iOS records precise geographic location coordinates—latitude, longitude, altitude, and positional accuracy—and embeds them directly into the file's EXIF header. When you share photos via email, messaging apps, AirDrop, or cloud storage links, anyone who downloads the file can read those GPS coordinates to pinpoint exactly where the photo was taken. Learning how to remove location from iphone photo files—whether natively inside iOS or using a browser-based tool—is one of the most effective steps you can take to protect your digital privacy.

## What EXIF Location Data Your iPhone Attaches to Every Photo

iPhones use a combination of GPS satellites, Wi-Fi networks, and cellular towers to pinpoint your location when the camera shutter fires. This information is written into the `APP1` marker segment of JPEG files or the metadata header of HEIC and WebP files using standard Exchangeable Image File Format (EXIF) tags.

Specifically, the EXIF `GPSInfo` IFD (Image File Directory) inside an iPhone photo contains:

- **`GPSLatitude` and `GPSLatitudeRef`:** Exact latitude degrees, minutes, and seconds (e.g., `37° 46' 29.8" N`).
- **`GPSLongitude` and `GPSLongitudeRef`:** Exact longitude degrees, minutes, and seconds (e.g., `122° 25' 10.1" W`).
- **`GPSAltitude` and `GPSAltitudeRef`:** Elevation above or below sea level in metres.
- **`GPSTimeStamp` and `GPSDateStamp`:** Atomic UTC time and date synchronized with GPS satellites.
- **`GPSHPositioningError`:** Precision accuracy metric (often indicating accuracy down to 3 to 5 metres).

In addition to GPS coordinates, the iPhone camera attaches device details including camera lens focal length, aperture, exposure settings, device model (e.g., `iPhone 15 Pro`), software version, and unique capture timestamps.

While location data helps the iOS Photos app group your memories into geographical maps, sharing raw photos publicly reveals your home address, workplace, daily routines, and vacation itineraries to anyone with a basic metadata viewer.

## Method 1: Removing Location via iOS Photos App Share Sheet

Apple includes native tools within iOS to remove location data before sharing a photo directly from your iPhone. This method is fast and works well when sending images to friends or social apps using the iOS Share Sheet.

### Option A: Stripping Location During Sharing
1. Open the **Photos** app on your iPhone and select the photo you wish to share.
2. Tap the **Share** button (the square with an arrow pointing upward) in the bottom-left corner.
3. At the top of the Share screen, tap **Options** next to the location preview.
4. Toggle the **Location** switch to the **Off** position.
5. Tap **Done** in the top-right corner, then select your sharing destination (e.g., Messages, Mail, or AirDrop).

iOS will generate a temporary copy of the photo with the `GPSInfo` block removed before sending it through the selected application.

### Option B: Permanently Removing Location From a Single Photo
If you want to remove the stored location from a photo directly inside your Photos library:
1. Open the photo in the **Photos** app.
2. Swipe up on the photo (or tap the **Info** button `(i)` at the bottom).
3. Tap **Adjust** in the bottom-right corner of the map preview.
4. Tap **No Location**.

This permanently deletes the GPS coordinates from that photo within your iOS library.

### Limitations of iOS Native Removal
While the Share Sheet and Photos app options are convenient, they have significant drawbacks:
- They must be applied manually or checked every time you share photos.
- Exporting files to a Mac or PC via USB or iCloud Drive often transfers original files with full EXIF data intact.
- iOS Share Sheet options do not allow you to strip device details, timestamps, or camera serial numbers while keeping location data.

## Method 2: Stripping GPS Coordinates via Browser Without Quality Loss

If you have exported iPhone photos (in HEIC, JPG, or WebP formats) to a computer, or if you want to clean multiple files systematically without relying on iOS settings, a browser-based container cleaner is the most reliable option.

Many desktop software tools or online converters attempt to strip metadata by opening the image, re-rendering the canvas, and saving a new compressed JPEG file. This approach causes generational quality loss through lossy re-compression.

Our [EXIF Remover](/exif-remover) operates directly on file container segments:
1. Open [EXIF Remover](/exif-remover) in Safari, Chrome, or any modern web browser on iOS, Mac, or Windows.
2. Select or drop your iPhone photos into the tool.
3. The cleaner reads the JPEG marker segments or HEIC container boxes locally in browser memory.
4. It locates the `APP1` EXIF block and drops the `GPSInfo` tags alongside camera model and timestamp data.
5. It writes a fresh file container with identical compressed image bytes (`IDAT` or `SOS` scan data).

Because the compressed pixel data is copied byte-for-byte, your photos suffer zero compression artifacts or visual degradation. Furthermore, your photos are never uploaded to any server—processing occurs entirely on your device.

## Beware the Orientation Tag: Why iPhone Photos Display Sideways After Cleaning

When removing EXIF data from iPhone photos, many users encounter a frustrating bug: after passing an iPhone photo through a generic EXIF stripper, portrait photos suddenly open sideways or upside down.

This happens because of how iPhones record physical camera orientation:

1. When you hold your iPhone vertically in portrait mode, the physical camera sensor still captures pixels horizontally.
2. Rather than wasting battery and processing power to physically rotate millions of raw pixel values, iOS saves the raw horizontal pixel array into the image file.
3. iOS writes an EXIF metadata tag called `Orientation` (e.g., `Orientation: 6`, specifying a 90-degree clockwise rotation).
4. Every modern web browser, operating system, and image viewer reads the `Orientation` tag on display and rotates the picture dynamically.

If you use a naive EXIF tool that wipes every single EXIF tag without exception, the `Orientation` tag is destroyed. Because the raw pixel array was never physically rotated, the photo defaults to its unrotated sensor state and displays sideways.

Our [EXIF Remover](/exif-remover) explicitly solves this problem. By default, it inspects your iPhone photo for an orientation marker, preserves that single integer field, and wipes every other EXIF tag—including GPS coordinates, device identifiers, and timestamps. Your photo remains properly oriented while your location and privacy remain completely protected.

## How to Verify Your Photo is Free of GPS Data

Never assume an image is free of location data without verifying the file container yourself.

To verify an iPhone photo:
1. Drag the cleaned photo into our [AI Watermark Checker](/ai-watermark-checker).
2. Look at the EXIF inspection panel in the scan report.
3. Confirm that the `GPSInfo` section reports **Not detected**.

It is equally essential to keep in mind a fundamental truth about digital media inspection: **the absence of metadata is not proof of origin.** While confirming that GPS coordinates are absent verifies that your location is hidden, the absence of EXIF data does not prove whether a photo was taken by an iPhone, edited in software, or generated by an AI model.

### Legal Notice
Removing EXIF metadata from your personal iPhone photography is a standard privacy measure. However, removing author attribution, copyright metadata, or provenance identifiers from images you do not own may violate applicable copyright regulations. Always ensure you have appropriate rights before modifying image metadata.

To strip GPS coordinates from your iPhone photos losslessly while maintaining correct image orientation, try our zero-upload [EXIF Remover](/exif-remover). For more details on metadata structures, read our comprehensive guide on [how to remove EXIF data](/guides/how-to-remove-exif-data).
