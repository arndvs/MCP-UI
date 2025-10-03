#!/usr/bin/env node

import path from 'path'
import fs from 'fs-extra'

const playgroundDestDir = process.env.EPICSHOP_PLAYGROUND_DEST_DIR
const wranglerPath = path.join(playgroundDestDir, 'wrangler.jsonc')
const wranglerDir = path.join(playgroundDestDir, '.wrangler')

if (await fs.pathExists(wranglerPath)) {
	try {
		let content = await fs.readFile(wranglerPath, 'utf8')
		const oldSchema = '../../../node_modules/wrangler/config-schema.json'
		const newSchema = '../node_modules/wrangler/config-schema.json'

		if (content.includes(oldSchema)) {
			content = content.replace(oldSchema, newSchema)
			await fs.writeFile(wranglerPath, content, 'utf8')
		}
	} catch (error) {
		console.error('❌ Error fixing wrangler.jsonc:', error.message)
	}
}

// Delete the .wrangler directory in the playground destination directory
await fs.remove(wranglerDir).catch(() => {})
