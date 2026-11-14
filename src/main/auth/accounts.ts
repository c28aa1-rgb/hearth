import { BrowserWindow, safeStorage } from 'electron'
import type { Account } from '@shared/types'
import { readJson, writeJson } from '../core/jsonfile'
import { getSettings, setSettings } from '../core/settings'
import { paths } from '../paths'
import { refresh, signIn, type MinecraftSession } from './microsoft'

interface StoredAccount extends Account {
  /** safeStorage-encrypted JSON of the MinecraftSession. */
  secret: string
}

// Only Microsoft accounts with a stored session are valid; anything else in the file is ignored.
const load = async () =>
  (await readJson<StoredAccount[]>(paths.accounts, [])).filter((a) => a.kind === 'microsoft' && !!a.secret)
const save = (list: StoredAccount[]) => writeJson(paths.accounts, list)
const strip = ({ secret: _secret, ...account }: StoredAccount): Account => account

function seal(session: MinecraftSession): string {
  return safeStorage.encryptString(JSON.stringify(session)).toString('base64')
}
function unseal(secret: string): MinecraftSession {
  return JSON.parse(safeStorage.decryptString(Buffer.from(secret, 'base64'))) as MinecraftSession
}

async function upsert(account: StoredAccount): Promise<Account> {
  const list = (await load()).filter((a) => a.id !== account.id)
  list.push(account)
  await save(list)
  await setSettings({ activeAccountId: account.id })
  return strip(account)
}

export async function listAccounts(): Promise<Account[]> {
  return (await load()).map(strip)
}

export async function signInMicrosoft(parent?: BrowserWindow): Promise<Account> {
  const session = await signIn(parent)
  return upsert({ id: session.uuid, name: session.name, kind: 'microsoft', skinUrl: session.skinUrl, secret: seal(session) })
}

export async function removeAccount(id: string): Promise<void> {
  const list = (await load()).filter((a) => a.id !== id)
  await save(list)
  const settings = await getSettings()
  if (settings.activeAccountId === id) await setSettings({ activeAccountId: list[0]?.id })
}

export interface LaunchIdentity { name: string; uuid: string; accessToken: string; userType: 'msa'; xuid?: string }

/** The active account, refreshed if its token is about to expire. */
export async function launchIdentity(): Promise<LaunchIdentity> {
  const { activeAccountId } = await getSettings()
  const list = await load()
  const account = list.find((a) => a.id === activeAccountId) ?? list[0]
  if (!account) throw new Error('Sign in with Microsoft to play.')
  let session = unseal(account.secret)
  if (session.expiresAt - Date.now() < 5 * 60_000) {
    try {
      session = await refresh(session.msRefreshToken)
    } catch {
      throw new Error(`${account.name}'s sign-in expired. Remove the account and sign in again.`)
    }
    await upsert({ ...account, name: session.name, skinUrl: session.skinUrl, secret: seal(session) })
  }
  return { name: session.name, uuid: session.uuid, accessToken: session.accessToken, userType: 'msa', xuid: session.xuid }
}
