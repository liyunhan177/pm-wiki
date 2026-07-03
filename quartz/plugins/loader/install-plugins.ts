#!/usr/bin/env node
import { readdir, readFile } from "fs/promises"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

async function installPluginDependencies(pluginPath: string): Promise<boolean> {
  try {
    const pkgPath = join(pluginPath, "package.json")
    const pkgContent = await readFile(pkgPath, "utf-8")
    const pkg = JSON.parse(pkgContent)

    if (pkg.quartz?.requiresInstall !== true) {
      return false
    }

    console.log(`Installing dependencies for plugin: ${pluginPath.split(/[\\/]/).pop()}`)

    const { spawn } = await import("child_process")
    const npmPath = process.platform === "win32" ? "npm.cmd" : "npm"
    
    return new Promise((resolve) => {
      const npm = spawn(npmPath, ["install"], {
        cwd: pluginPath,
        stdio: "inherit",
        shell: true,
      })

      npm.on("close", (code) => {
        resolve(code === 0)
      })

      npm.on("error", (err) => {
        console.error(`Failed to install dependencies for ${pluginPath.split(/[\\/]/).pop()}:`, err)
        resolve(false)
      })
    })
  } catch {
    return false
  }
}

async function installExistingPlugins() {
  const pluginsDir = join(__dirname, "../../../.quartz/plugins")

  console.log("Checking for existing plugins with requiresInstall...")
  let installedCount = 0

  try {
    const entries = await readdir(pluginsDir, { withFileTypes: true })
    const pluginDirs = entries.filter((entry) => entry.isDirectory())

    for (const dir of pluginDirs) {
      const pluginPath = join(pluginsDir, dir.name)
      const success = await installPluginDependencies(pluginPath)
      if (success) {
        installedCount++
      }
    }
  } catch (err) {
    console.warn("Could not check existing plugins:", err)
  }

  if (installedCount > 0) {
    console.log(`✓ Installed dependencies for ${installedCount} existing plugin(s)`)
  }

  return installedCount
}

async function installExternalPlugins() {
  const { installPlugins, parsePluginSource } = await import("./gitLoader.js")
  const config = await import("../../../quartz.js")

  const quartzConfig: any = config.default || config
  const externalPlugins = quartzConfig.externalPlugins || []

  if (externalPlugins.length === 0) {
    console.log("No external plugins to install.")
    return
  }

  console.log(`Installing ${externalPlugins.length} plugin(s) from Git...`)

  const specs = externalPlugins.map((source: string) => parsePluginSource(source))
  const installed = await installPlugins(specs, { verbose: true })

  if (installed.size === externalPlugins.length) {
    console.log("✓ All external plugins installed successfully")
  } else {
    console.error(`✗ Only ${installed.size}/${externalPlugins.length} external plugins installed`)
    process.exit(1)
  }
}

async function main() {
  await installExistingPlugins()

  try {
    await installExternalPlugins()
  } catch (err) {
    console.warn("Failed to install external plugins (continuing):", err)
  }
}

main().catch((err) => {
  console.error("Failed to install plugins:", err)
  process.exit(1)
})
