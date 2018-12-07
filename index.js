const GitHubApi = require("github");

const config = {
  ciUser: "[ci machine user account]",
  ciAccessToken: "[personal access token]",
  repoOwner: "[github org]"
};

// Can be one of error, failure, pending, or success.
const statusMap = {
  QUEUED: "pending",
  WORKING: "pending",
  SUCCESS: "success",
  FAILURE: "failure",
  CANCELLED: "failure",
  TIMEOUT: "error",
  INTERNAL_ERROR: "error"
};

// setCIStatus is the main function.
module.exports.setCIStatus = event => {
  build = eventToBuild(event.data.data);
  console.log(`gcloud container builds describe --format=json ${build.id}`);

  const {
    id,
    projectId,
    status,
    steps,
    images,
    sourceProvenance: { resolvedRepoSource: repoSource },
    logUrl,
    tags,
    createTime,
    finishTime
  } = build;

  const ghStatus = statusMap[status];

  console.log("github status:", ghStatus);
  console.log("repo source:", repoSource);

  if (!repoSource || !ghStatus) return;

  const ghRepo =
    repoSource.repoName.indexOf(`github_${config.repoOwner}_`) == 0
      ? repoSource.repoName.replace(`github_${config.repoOwner}_`, "")
      : false;

  console.log("github repo:", ghRepo);

  if (!ghRepo) return;

  const prettyTags =
    tags &&
    tags.filter(t => !t.match(/(event|trigger|eval|invocation)-[\w-]{36}/));
  const ghContext =
    prettyTags && prettyTags.length > 0
      ? `${projectId}/gcb: ${prettyTags.join("/")}`
      : `${projectId}/gcb: ${id.substring(0, 8)}`;

  const lastStep = steps.filter(s => s.timing && s.timing.startTime).pop();

  const failureDescription =
    ghStatus == "failure" || ghStatus == "error"
      ? " · " + (lastStep ? `${lastStep.name} ` : "") + status.toLowerCase()
      : "";
  const ghDescription = (createTime && finishTime
    ? secondsToString((new Date(finishTime) - new Date(createTime)) / 1000) +
      failureDescription
    : images && images.length > 0
      ? `${images.join("\n")}`
      : ""
  ).substring(0, 140);

  let github = new GitHubApi();
  github.authenticate({
    type: "token",
    token: config.ciAccessToken
  });

  let request = {
    owner: config.repoOwner,
    repo: ghRepo,
    sha: repoSource.commitSha,
    state: ghStatus,
    target_url: logUrl,
    description: ghDescription,
    context: ghContext
  };

  console.log(JSON.stringify(request, null, 2));

  return github.repos.createStatus(request);
};

// eventToBuild transforms pubsub event message to a build object.
const eventToBuild = data => JSON.parse(new Buffer(data, "base64").toString());

// secondsToString turns a number of seconds into a human-readable duration.
const secondsToString = s => {
  const years = Math.floor(s / 31536000);
  const days = Math.floor((s % 31536000) / 86400);
  const hours = Math.floor(((s % 31536000) % 86400) / 3600);
  const minutes = Math.floor((((s % 31536000) % 86400) % 3600) / 60);
  const seconds = Math.floor((((s % 31536000) % 86400) % 3600) % 60);

  return `${years}y ${days}d ${hours}h ${minutes}m ${seconds}s`.replace(
    /^(0[ydhm] )*/g,
    ""
  );
};
