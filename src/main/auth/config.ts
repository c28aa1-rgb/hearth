/**
 * Azure app (public client) used for Microsoft sign-in.
 *
 * 1. Register an app at https://portal.azure.com → App registrations.
 *    Supported account types: "Personal Microsoft accounts only".
 *    Platform: "Mobile and desktop applications" with the redirect URI below.
 * 2. Ask Microsoft to allow it to use the Minecraft API: https://aka.ms/mce-reviewappid
 * 3. Paste the Application (client) ID here, or set HEARTH_AZURE_CLIENT_ID.
 *
 * A public client has no secret, so this ID is safe to commit.
 */
export const AZURE_CLIENT_ID = process.env.HEARTH_AZURE_CLIENT_ID ?? '31ae2547-0d69-4b68-855e-2b6e0a85fad5'

export const REDIRECT_URI = 'https://login.microsoftonline.com/common/oauth2/nativeclient'
