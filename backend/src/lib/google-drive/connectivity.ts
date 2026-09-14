import dns from 'dns/promises';

export async function hasInternetConnectivity(): Promise<boolean> {
  for (const host of ['drive.googleapis.com', 'google.com']) {
    try {
      await dns.resolve(host);
      return true;
    } catch {
      // try next host
    }
  }
  return false;
}
