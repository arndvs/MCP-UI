import { type DBClient } from '@epic-web/epicme-db-client'

export async function getTagRemoteDomUIScript(db: DBClient, tagId: number) {
	const tag = await db.getTag(tagId)
	if (tag) {
		return /* js */ `
const stack = document.createElement('ui-stack');
stack.setAttribute('direction', 'vertical');
stack.setAttribute('spacing', '20');
stack.setAttribute('align', 'center');

const title = document.createElement('ui-text');
title.setAttribute('content', ${JSON.stringify(tag.name)});
stack.appendChild(title);

const description = document.createElement('ui-text');
description.setAttribute('content', ${JSON.stringify(tag.description)});
stack.appendChild(description);

root.appendChild(stack);
		`.trim()
	} else {
		return /* js */ `
const stack = document.createElement('ui-stack');
stack.setAttribute('direction', 'vertical');
stack.setAttribute('spacing', '20');
stack.setAttribute('align', 'center');

const title = document.createElement('ui-text');
title.setAttribute('content', 'Tag not found');
stack.appendChild(title);

root.appendChild(stack);
		`.trim()
	}
}

// we'll just keep this for reference for now...
export async function getTagViewUI(db: DBClient, tagId: number) {
	const tag = await db.getTag(tagId)
	if (tag) {
		return /* html */ `
	<html>
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Epic Me</title>
			<style>
				* { margin: 0; padding: 0; box-sizing: border-box; }
				body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: oklch(20% 0.06 320); background-color: oklch(98% 0.02 320); }
				.container { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem; }
				.title { font-size: 2rem; font-weight: 700; color: oklch(20% 0.06 320); margin-bottom: 2rem; text-align: center; }
				.description { text-align: center; color: oklch(40% 0.07 320); }
			</style>
		</head>
		<body>
			<div class="container">
				<h1 class="title">${tag.name}</h1>
				<p class="description">${tag.description}</p>
			</div>
		</body>
	</html>
		`
	}

	return /* html */ `
<html>
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Epic Me</title>
		<style>
			* { margin: 0; padding: 0; box-sizing: border-box; }
			body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: oklch(20% 0.06 320); background-color: oklch(98% 0.02 320); }
			.container { max-width: 1200px; margin: 0 auto; padding: 2rem 1rem; }
			.title { font-size: 2rem; font-weight: 700; color: oklch(20% 0.06 320); margin-bottom: 2rem; text-align: center; }
			.description { text-align: center; color: oklch(40% 0.07 320); }
			.error-state { text-align: center; padding: 4rem 2rem; }
			.error-state h1 { margin: 1rem 0 2rem; color: oklch(20% 0.06 320); }
			.error-icon { color: oklch(60% 0.18 0); width: 3rem; height: 3rem; display: inline-flex; align-items: center; justify-content: center; }
			.error-icon svg { width: 100%; height: 100%; }
		</style>
	</head>
	<body>
		<div class="container">
			<div class="error-state">
				<span class="error-icon" data-icon="alert-circle">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10"/>
						<line x1="12" y1="8" x2="12" y2="12"/>
						<line x1="12" y1="16" x2="12.01" y2="16"/>
					</svg>
				</span>
				<h1>Tag with id ${tagId} not found</h1>
			</div>
		</div>
	</body>
</html>
		`
}
