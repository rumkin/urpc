import path from 'path'
import fs from 'fs'
import {spawnSync} from 'child_process'

function allNests(pathname) {
  const parts = pathname.split(path.sep)
  const out = []
  while (parts.length) {
    out.push(parts.join(path.sep))
    parts.pop()
  }
  return out
}

function lookup(pathname, search, root) {
  const nests = allNests(pathname)

  for (const nest of nests) {
    const fullpath = path.join(root, nest, search)

    if (fs.existsSync(fullpath)) {
      return fullpath
    }
  }

  return null
}

function main([exec, ...argv]) {
  const pwd = process.cwd()
  const home = process.env.HOME
  let dir = pwd
  let root = '/'

  if (pwd.startsWith(home)) {
    root = home
    dir = pwd.slice(home.length)
  }

  const target = lookup(dir, path.join('node_modules', '.bin', exec), root)
  if (! target) {
    console.error(`Executable "${exec}" not found`)
    process.exit(1)
  }

  const {status, error} = spawnSync(target, argv, {
    stdio: 'inherit',
  })

  if (error) {
    console.error('Process error: ', error)
    process.exit(1)
  }

  process.exit(status)
}

main(process.argv.slice(2))
