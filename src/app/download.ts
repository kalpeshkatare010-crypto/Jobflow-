import { isNativeApp } from './native';

/**
 * Saves a CSV file. In a browser it downloads; in the Android app it is
 * written to the app's cache and the phone's share sheet opens, so it can be
 * saved to Files or Drive, or sent on WhatsApp or email.
 */
export async function saveCsv(fileName: string, csv: string): Promise<void> {
  if (isNativeApp()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const written = await Filesystem.writeFile({ path: fileName, data: csv, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: fileName, url: written.uri, dialogTitle: 'Save or send the report' });
    return;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
