import * as core from '@actions/core'
import * as yaml from 'js-yaml'
import * as fs from 'fs'
import * as github from '@actions/github'

interface Update {
  'package-ecosystem': string
  'target-branch': string
  milestone?: number
}

interface Template {
  updates: Update[]
}

const inputs = {
  branches: (core.getInput('branches') as string).split(',').map(v => v.trim()),
  templateFile: core.getInput('template-file')
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const template = yaml.load(
      fs.readFileSync(inputs.templateFile, 'utf-8')
    ) as Template
    const updatesTemplate = template.updates
    const resolvedUpdates: Update[] = []
    const octokit = github.getOctokit(core.getInput('gh-token'))
    const milestones = await octokit.request(
      'GET /repos/{owner}/{repo}/milestones?state=open',
      {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo
      }
    )
    const data: any[] = milestones.data
    const milestoneByTitle = data.reduce((map, obj) => {
      map[obj.title] = obj.number
      return map
    }, {})

    for (const baseUpdate of updatesTemplate) {
      for (const branch of inputs.branches) {
        const resolved: Update = {
          ...baseUpdate,
          'target-branch': branch
        }
        const milestone = milestoneByTitle[branch]
        if (!!milestone) {
          resolved.milestone = milestone
        } else {
          delete resolved.milestone
        }
        resolvedUpdates.push(resolved)
      }
    }
    core.info(`Resolved updates ${resolvedUpdates}`)
    template.updates = resolvedUpdates
    core.info('Writing config to .github/dependabot.yml')
    core.info('Final template:')
    const finalTemplate = yaml.dump(template, { noRefs: true })
    core.info(finalTemplate)
    fs.writeFileSync('.github/dependabot.yml', finalTemplate)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
