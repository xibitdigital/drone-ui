import Emmett from 'emmett';
import Request from 'superagent';
import {tree} from './tree';

export const events = new Emmett();

export const GET_FEED = 'GET_FEED';
export const GET_REPO = 'GET_REPO';
export const DEL_REPO = 'DEL_REPO';
export const PATCH_REPO = 'PATCH_REPO';
export const POST_REPO = 'POST_REPO';
export const GET_REPO_LIST = 'GET_REPO_LIST';
export const SYNC_REPO_LIST = 'SYNC_REPO_LIST';
export const GET_BUILD = 'GET_BUILD';
export const POST_BUILD = 'POST_BUILD';
export const DEL_BUILD = 'DEL_BUILD';
export const GET_BUILD_LIST = 'GET_BUILD_LIST';
export const GET_BUILD_LOGS = 'GET_BUILD_LOGS';
export const FILTER = 'FILTER';
export const FILTER_CLEAR = 'FILTER_CLEAR';
export const GET_TOKEN = 'GET_TOKEN';
export const SHOW_TOKEN = 'SHOW_TOKEN';
export const HIDE_TOKEN = 'HIDE_TOKEN';
export const CLEAR_TOAST = 'CLEAR_TOAST';

events.once(GET_FEED, function(event) {
  Request.get('/api/user/feed?latest=true')
    .end((err, response) => {
      if (err != null) {
        console.error(err);
      }
      let feed = JSON.parse(response.text);
      feed.sort(function(a, b) {
        return b.started_at - a.started_at;
      });
      tree.set('feed', feed);
    });
});

events.once(GET_REPO_LIST, function(event) {
  Request.get('/api/user/repos?all=true')
    .end((err, response) => {
      if (err != null) {
        console.error(err);
      }
      let repos = JSON.parse(response.text);
      repos.sort(function(a, b) {
        if(a.full_name < b.full_name) return -1;
        if(a.full_name > b.full_name) return 1;
        return 0;
      });
      tree.set(['user', 'repos'], repos);
    });
});

events.on(SYNC_REPO_LIST, function(event) {
  Request.get('/api/user/repos?all=true&flush=true')
    .end((err, response) => {
      if (err != null) {
        tree.set(['pages', 'toast'], 'Error syncing repository list');
        return;
      }
      let repos = JSON.parse(response.text);
      repos.sort(function(a, b) {
        if(a.full_name < b.full_name) return -1;
        if(a.full_name > b.full_name) return 1;
        return 0;
      });
      tree.set(['user', 'repos'], repos);
      tree.set(['pages', 'toast'], 'Successfully synchronized repository list');
    });
});

events.on(GET_REPO, function(event) {
  const {owner, name} = event.data;
  Request.get(`/api/repos/${owner}/${name}`)
    .end((err, response) => {
      if (err != null) {
        console.error(err);
      }
      let repo = JSON.parse(response.text);
      let cursor = tree.select(['repos', owner, name]);
      if (cursor.get()) {
        cursor.merge(repo);
      } else {
        tree.set(['repos', owner, name], repo);
      }
    });
});

events.on(PATCH_REPO, function(event) {
  const {owner, name} = event.data;

  // there is a bug where the input parameter names differ from
  // the output parameter names. This attempts to resolve.
  if (event.data.allow_deploys !== undefined) {
    event.data['allow_deploy'] = event.data.allow_deploys;
  }
  if (event.data.allow_tags !== undefined) {
    event.data['allow_tag'] = event.data.allow_tags;
  }

  Request.patch(`/api/repos/${owner}/${name}`)
    .send(event.data)
    .end((err, response) => {
      if (err != null) {
        console.error(err);
        tree.set(['pages', 'toast'], 'Error updating repository settings');
        return
      }
      let repo = JSON.parse(response.text);
      tree.set(['repos', owner, name], repo);
      tree.set(['pages', 'toast'], 'Successfully updated repository settings');
    });
});

events.on(GET_BUILD_LIST, function(event) {
  const {owner, name} = event.data;
  Request.get(`/api/repos/${owner}/${name}/builds`)
    .end((err, response) => {
      if (err != null) {
        console.error(err);
      }
      let builds = JSON.parse(response.text);
      builds.map(function(build) {
        tree.set(['builds', owner, name, build.number], build);
      });
    });
});


events.on(GET_BUILD, function(event) {
  const {owner, name, number} = event.data;
  Request.get(`/api/repos/${owner}/${name}/builds/${number}`)
    .end((err, response) => {
      if (err != null) {
        console.error(err);
      }
      let build = JSON.parse(response.text);
      tree.unset('logs');
      tree.set(['builds', owner, name, build.number], build);
    });
});

events.on(GET_BUILD_LOGS, function(event) {
  const {owner, name, number, job} = event.data;
  Request.get(`/api/repos/${owner}/${name}/logs/${number}/${job}`)
    .end((err, response) => {
      if (err != null) {
        console.error(err);
      }
      let lines = JSON.parse(response.text);
      let procs = {};

      // this code groups the lines of output by process.
      lines.map(function(line) {
        if (!line || !line.proc || !line.out) return;
        let proc = procs[line.proc];
        if (!proc) {
          proc=[];
          procs[line.proc]=proc;
        }
        proc.push(line);
      });

      tree.set('logs', procs);
    });
});

events.on(DEL_REPO, (event) => {
  const {owner, name} = event.data;

  tree.select(['user','repos']).map((cursor, i) => {
    var selected = cursor.get();
    if (selected.owner == owner && selected.name == name) {
      cursor.unset(['id']);
    }
  });

  Request.del(`/api/repos/${owner}/${name}`)
    .end((err, response) => {
      if (err != null) {
        console.error(err);
        tree.set(['pages', 'toast'], `Error disabling ${owner}/${name}`);
        return
      }

      tree.unset(['repos', owner, name]);
      tree.unset(['builds', owner, name]);

      // tree.select(['user','repos']).map((cursor, i) => {
      //   var selected = cursor.get();
      //   if (selected.owner == owner && selected.name == name) {
      //     cursor.unset(['id']);
      //   }
      // });

      // TODO remove from feed

      tree.set(['pages', 'toast'], `Successfully disabled ${owner}/${name}`);
    });
});

events.on(POST_REPO, (event) => {
  const {owner, name} = event.data;

  tree.select(['user','repos']).map((cursor, i) => {
    var selected = cursor.get();
    if (selected.owner == owner && selected.name == name) {
      cursor.set(['id'], -1);
    }
  });

  Request.post(`/api/repos/${owner}/${name}`)
    .end((err, response) => {
      if (err != null) {
        console.error(err);
        tree.set(['pages', 'toast'], `Error activating ${repo.full_name}`);
        return
      }

      let repo = JSON.parse(response.text);

      // update the repositroy index to include this repository.
      tree.set(['repos', owner, name], repo);

      // update the repository in the user repository list, iterate
      // through the cursor to find the entry.
      tree.select(['user','repos']).map((cursor, i) => {
        var selected = cursor.get();
        if (selected.owner == owner && selected.name == name) {
          cursor.merge(repo)
        }
      });

      // append the repsotiroy to the feed.
      tree.push(['feed'], repo);
      tree.set(['pages', 'toast'], `Successfully activated ${repo.full_name}`);
    });
});

events.once(GET_TOKEN, function(event) {
  Request.post(`/api/user/token`)
    .end((err, response) => {
      if (err != null) {
        console.error(err); // TODO: Add ui error handling
      }

      tree.set('token', response.text);
    });
});

events.on(SHOW_TOKEN, function(event) {
  tree.set(['pages', 'account', 'token'], true);
});

events.on(HIDE_TOKEN, function(event) {
  tree.set(['pages', 'account', 'token'], false);
});

events.on(FILTER, function(event) {
  const data = event.data.toLowerCase();
  if (data === '') {
    tree.unset(['pages', 'repo', 'filter']);
  } else {
    tree.set(['pages', 'repo', 'filter'], data);
  }
});

events.on(FILTER_CLEAR, function(event) {
  tree.unset(['pages', 'repo', 'filter']);
});

events.on(CLEAR_TOAST, function(event) {
  tree.unset(['pages', 'toast']);
});