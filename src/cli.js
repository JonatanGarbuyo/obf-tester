import yargs from 'yargs'
import { runValidate, runBatch } from './commands/validate.js'
import { runCheck } from './commands/check.js'
import { runDiscover } from './commands/discover.js'

export async function run(args) {
  await yargs(args)
    .scriptName('obf')
    .locale('en')
    .usage('Usage: $0 <command> [options]')
    .command(['validate [url]', '$0'], 'Validate a feed URL', (yargs) => {
      yargs
        .positional('url', { type: 'string', describe: 'Feed URL' })
        .option('type', { type: 'string', describe: 'Feed type: xml, rss, atom, sitemap' })
        .option('source', { type: 'string', describe: 'File with routes, - for stdin' })
        .option('domain', { type: 'string', describe: 'Base domain for relative routes' })
        .option('recursive', { type: 'boolean', describe: 'Follow sitemap-index children' })
        .option('local', { type: 'boolean', describe: 'Shorthand for --domain http://localhost' })
        .option('max-concurrency', { type: 'number', default: 1, describe: 'Concurrent requests' })
        .option('delay', { type: 'number', describe: 'Delay between requests (default 300)' })
        .option('max-pagination', { type: 'number', default: 0, describe: 'Max children per sitemap-index' })
        .option('content-type', { type: 'string', describe: 'Expected Content-Type' })
        .option('output', { type: 'string', describe: 'Write failure report to file' })
        .option('deploy', { type: 'number', describe: 'Arc XP deploy number (?d=N)' })
    }, async (argv) => {
      if (argv.source) {
        await runBatch(argv)
      } else if (argv.url) {
        await runValidate(argv)
      } else {
        console.error('Error: <url> or --source is required')
        console.error('Usage: obf validate [url] [options]')
        process.exit(1)
      }
    })
    .command('discover <url>', 'Discover sitemaps from robots.txt', () => {}, async (argv) => {
      await runDiscover(argv)
    })
    .command('check <url>', 'Discover + validate recursively', (yargs) => {
      yargs
        .positional('url', { type: 'string', describe: 'Domain to check' })
        .option('local', { type: 'boolean', describe: 'Shorthand for --domain http://localhost' })
        .option('max-concurrency', { type: 'number', default: 1, describe: 'Concurrent requests' })
        .option('delay', { type: 'number', describe: 'Delay between requests (default 300)' })
        .option('max-pagination', { type: 'number', default: 0, describe: 'Max children per sitemap-index' })
        .option('deploy', { type: 'number', describe: 'Arc XP deploy number (?d=N)' })
    }, async (argv) => {
      await runCheck(argv)
    })
    .demandCommand(1, 'Please specify a command')
    .strict()
    .help()
    .fail((msg, err) => {
      if (err) throw err
      if (msg) {
        console.error(`Error: ${msg}\n`)
        process.exit(1)
      }
    })
    .parse()
}
