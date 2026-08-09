const esbuild = require('esbuild');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: isProduction,
    sourcemap: !isProduction,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: [
        'vscode',
        'onnxruntime-node',
        '@huggingface/transformers'
    ],
};

async function main() {
    if (isWatch) {
        const ctx = await esbuild.context(buildOptions);
        await ctx.watch();
        console.log('[watch] build started');
    } else {
        await esbuild.build(buildOptions);
        console.log('Build complete');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});