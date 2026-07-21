import inquirer from 'inquirer'

export interface SelectChoice {
  name: string
  value: string
  description?: string
}

const DONE_PREFIX = '\u2714 '
const PROMPT_THEME = { prefix: { idle: '?', done: DONE_PREFIX } }

const normalizePromptMessage = (message: string) => message.trimStart()

export async function promptInput(opts: {
  message: string
  default?: string
  validate?: (v: string) => true | string
}): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message: normalizePromptMessage(opts.message),
      default: opts.default,
      validate: opts.validate,
      theme: PROMPT_THEME,
    },
  ])
  return String(value ?? '')
}

export async function promptPassword(opts: {
  message: string
  default?: string
  validate?: (v: string) => true | string
}): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: 'password',
      name: 'value',
      message: normalizePromptMessage(opts.message),
      default: opts.default,
      mask: '*',
      validate: opts.validate,
      theme: PROMPT_THEME,
    },
  ])
  return String(value ?? '')
}

export async function promptConfirm(opts: { message: string; default?: boolean }): Promise<boolean> {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: normalizePromptMessage(opts.message),
      default: opts.default ?? true,
      theme: PROMPT_THEME,
    },
  ])
  return Boolean(confirm)
}

export async function promptSelect(opts: {
  message: string
  choices: SelectChoice[]
  default?: string
  type?: 'list' | 'select' | 'rawlist'
  pageSize?: number
}): Promise<string> {
  const resolvedType = opts.type === 'list' || !opts.type ? 'select' : opts.type
  const { value } = await inquirer.prompt([
    {
      type: resolvedType,
      name: 'value',
      message: normalizePromptMessage(opts.message),
      choices: opts.choices,
      default: opts.default,
      pageSize: opts.pageSize,
      theme: PROMPT_THEME,
    } as any,
  ])
  return String(value)
}

export async function promptMultiSelect(opts: {
  message: string
  choices: Array<SelectChoice & { checked?: boolean }>
}): Promise<string[]> {
  const { values } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'values',
      message: normalizePromptMessage(opts.message),
      choices: opts.choices,
      theme: PROMPT_THEME,
    },
  ])
  return Array.isArray(values) ? values.map((v) => String(v)) : []
}
