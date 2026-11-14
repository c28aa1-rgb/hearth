import { createHash, randomBytes } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { HttpError, postJson, request } from '../core/http'
import { AZURE_CLIENT_ID, REDIRECT_URI } from './config'

const AUTHORIZE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize'
const TOKEN = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const SCOPE = 'XboxLive.signin offline_access'

export interface MinecraftSession {
  uuid: string
  name: string
  skinUrl?: string
  accessToken: string
  expiresAt: number
  xuid?: string
  msRefreshToken: string
}

const b64url = (buf: Buffer) => buf.toString('base64url')

/** Opens Microsoft's sign-in page in a window and resolves with the authorization code. */
function promptForCode(parent: BrowserWindow | undefined, challenge: string): Promise<string> {
  const url = new URL(AUTHORIZE)
  url.search = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  }).toString()

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 480,
      height: 640,
      parent,
      modal: !!parent,
      title: 'Sign in with Microsoft',
      backgroundColor: '#ffffff',
      webPreferences: { partition: `msa-${randomBytes(4).toString('hex')}`, sandbox: true }
    })
    let settled = false
    const check = (target: string) => {
      if (!target.startsWith(REDIRECT_URI)) return false
      const params = new URL(target).searchParams
      settled = true
      win.destroy()
      const code = params.get('code')
      if (code) resolve(code)
      else reject(new Error(params.get('error_description') ?? 'Sign-in was cancelled.'))
      return true
    }
    win.webContents.on('will-redirect', (e, target) => { if (check(target)) e.preventDefault() })
    win.webContents.on('will-navigate', (e, target) => { if (check(target)) e.preventDefault() })
    win.on('closed', () => { if (!settled) reject(new Error('Sign-in was cancelled.')) })
    void win.loadURL(url.toString())
  })
}

interface MsTokens { access_token: string; refresh_token: string }

async function msToken(params: Record<string, string>): Promise<MsTokens> {
  const res = await request(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: AZURE_CLIENT_ID, scope: SCOPE, ...params }).toString()
  }, 1)
  return res.json() as Promise<MsTokens>
}

interface XboxResponse { Token: string; DisplayClaims: { xui: { uhs: string; xid?: string }[] } }

async function xboxChain(msAccessToken: string) {
  const xbl = await postJson<XboxResponse>('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  })
  let xsts: XboxResponse
  try {
    xsts = await postJson<XboxResponse>('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      if (err.body.includes('2148916233')) throw new Error('This Microsoft account has no Xbox profile. Sign in once at minecraft.net, then try again.')
      if (err.body.includes('2148916238')) throw new Error('This is a child account. An adult needs to add it to a Microsoft family first.')
    }
    throw err
  }
  const uhs = xsts.DisplayClaims.xui[0].uhs
  return { uhs, xsts: xsts.Token, xuid: xsts.DisplayClaims.xui[0].xid }
}

interface McLogin { access_token: string; expires_in: number }
interface McProfile { id: string; name: string; skins?: { state: string; url: string }[] }

async function minecraftLogin(msAccessToken: string, msRefreshToken: string): Promise<MinecraftSession> {
  const { uhs, xsts, xuid } = await xboxChain(msAccessToken)
  let login: McLogin
  try {
    login = await postJson<McLogin>('https://api.minecraftservices.com/authentication/login_with_xbox', {
      identityToken: `XBL3.0 x=${uhs};${xsts}`
    })
  } catch (err) {
    if (err instanceof HttpError && err.status === 403) {
      throw new Error("Microsoft hasn't approved Hearth's app registration for Minecraft yet. Approval comes from aka.ms/mce-reviewappid.")
    }
    throw err
  }
  let profile: McProfile
  try {
    const res = await request('https://api.minecraftservices.com/minecraft/profile', {
      headers: { Authorization: `Bearer ${login.access_token}` }
    }, 1)
    profile = (await res.json()) as McProfile
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) throw new Error("This account doesn't own Minecraft: Java Edition.")
    throw err
  }
  return {
    uuid: profile.id,
    name: profile.name,
    skinUrl: profile.skins?.find((s) => s.state === 'ACTIVE')?.url,
    accessToken: login.access_token,
    expiresAt: Date.now() + login.expires_in * 1000,
    xuid,
    msRefreshToken
  }
}

export async function signIn(parent?: BrowserWindow): Promise<MinecraftSession> {
  if (!AZURE_CLIENT_ID) {
    throw new Error('Microsoft sign-in needs an Azure client ID. See src/main/auth/config.ts.')
  }
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const code = await promptForCode(parent, challenge)
  const tokens = await msToken({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier })
  return minecraftLogin(tokens.access_token, tokens.refresh_token)
}

export async function refresh(msRefreshToken: string): Promise<MinecraftSession> {
  const tokens = await msToken({ grant_type: 'refresh_token', refresh_token: msRefreshToken })
  return minecraftLogin(tokens.access_token, tokens.refresh_token)
}
