// In-memory only holder for the admin password. Used by supabaseSync helpers
// to authenticate writes against the `admin-db` edge function.
// Never persisted to localStorage/sessionStorage.

let adminPassword: string | null = null;

export function setAdminPassword(password: string | null) {
  adminPassword = password;
}

export function getAdminPassword(): string | null {
  return adminPassword;
}

export function clearAdminPassword() {
  adminPassword = null;
}
