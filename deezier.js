// ==UserScript==
// @name        Deezier
// @namespace   Violentmonkey Scripts
// @match       https://www.deezer.*/*
// @grant       none
// @version     1.0
// @author      -
// @description Make Deezer better enhancing it with new features
// ==/UserScript==



class ElementBuilder {
  
  static createAddedToken(inPlaylists) {
    // Create a little visual marker meaning 'already present in a playlist' 
    var token = document.createElement("div");
    token.className = "datagrid-cell cell-explicit-small";
    token.setAttribute("title", inPlaylists.join('\n'));
    var content = document.createElement("div");
    content.className = "explicit outline small";
    content.innerHTML = "V";
    content.style["border-color"] = 'green';
    content.style["color"] = 'green';
    token.appendChild(content);
    return token;
  }
  
  static createButtonDetectAddedTracks(deezierArea) {
    var buttonDetectAddedTracks = document.createElement("button");
    buttonDetectAddedTracks.innerText = "Detect Added Tracks";
    buttonDetectAddedTracks.addEventListener('click', deezierArea.appendAddedTokens);
    buttonDetectAddedTracks.library = deezierArea.library;
    return buttonDetectAddedTracks;
  }
    
}

class ElementFinder {
    
  static getProfileId() {
    // Discover the user id by looking at current page
    var l = document.getElementsByClassName("sidebar-nav-link is-main");
    for (let e of l) {
      var res = e.href.match(/.*profile\/(\d+)/);
      if (res) { return res[1] }
    }
  }
  
  static getTracksInPage() {
    // Build an array of tracks present in current page
    // TODO : deezer inject tracks incrementally when scrolling down, should simulate it before retrieving tracks 
    return document.getElementsByClassName("datagrid-row song");
  }

  static getTrackIdFromElement(songElement) {
    var urlToParse = songElement.getElementsByClassName("datagrid-label-main title")[0].getAttribute('href');
    return parseInt(urlToParse.substr(urlToParse.lastIndexOf('/')+1));
  }

}

class MusicLibrary {
  
  constructor(profileId) {
    this.profileId = profileId;
    this.playlists = {};
  }
  
  async computePlaylists() {
    // Fill the inner playlists object with metadata from the user playlists (not the tracks in yet)
    // The tracks field has to be filled afterwards calling fetchTracks()
    return new Promise((resolve, reject) => {
      this.fetchPlaylists().then((p_list) => {
        console.log("Fetched", p_list.length, "playlists");
        p_list.map(p => {
          this.playlists[p.id] = {
            url: p.url,
            title: p.title,
            length: p.length,
            tracks: [],
            url_tracks: p.url_tracks,
            url_picture: p.url_picture,
            time_lastmodif: p.time_lastmodif
          };
        })
        resolve();
      });
    })
  }

  async computeTracks(playlistIds=[]) {
    return new Promise((resolve, reject) => {
      playlistIds = playlistIds.length > 0 ? playlistIds : Object.keys(this.playlists);
      for (let p of playlistIds) {
        this.fetchTracks(p).then((track_ids) => this.playlists[p].tracks = track_ids)      
      }
      resolve();
    })
  }
  
  async fetchPlaylists() {
    // Get URIs list of all personal playlists from the given user, where a playlist is an object gathering useful fields about it
    const response = await fetch(`https://api.deezer.com/user/${this.profileId}/playlists&limit=1000`);
    const playlists = await response.json();
    return playlists.data.map(p => ({
      url: p.link,
      title: p.title,
      id: p.id,
      length: p.nb_tracks,
      url_tracks: p.tracklist,
      url_picture: p.picture,
      time_lastmodif: p.time_mod
    }) );
  }

  async fetchTracks(playlist_id) {
    const response = await fetch(`${this.playlists[playlist_id].url_tracks}&limit=1000`);
    const tracks = await response.json();
    return tracks.data.map(t => t.id);
  }
  
  getAllTracks() {
    var allTracks = [];
    Object.values(this.playlists).map(p => allTracks.push(...p.tracks));
    return allTracks;
  }
  
  getPlaylistsContainingTrack(track_id) {
    var inPlaylists = [];
    Object.values(this.playlists).map(p => {
      if (p.tracks.includes(track_id)) { inPlaylists.push(p.title) }
    });
    return inPlaylists;
  }
  
  display() {
    console.log("Music library for user", this.profileId, this.playlists);
  }
  
  getPlaylist(id) {
    return this.playlists[id];
  }
  
}

class DeezierArea {
  
  constructor(library) {
    this.library = library;
  }
  
  injectInPage() {
    // Inject the area in the left side bar of Deezer interface
    var sidebar = document.getElementsByClassName("nano-content")[0];
    var area = document.createElement("div");
    area.appendChild(ElementBuilder.createButtonDetectAddedTracks(this));
    sidebar.appendChild(area);
  }
  
  appendAddedTokens() {
    var tracks = ElementFinder.getTracksInPage();
    console.log("Found", tracks.length, "tracks on this page !");
    // TODO : not very efficient to go through the whole library for each track >:(
    for (let track of tracks) {
      var track_id = ElementFinder.getTrackIdFromElement(track);
      if(track.getAttribute('deezier-token')) {
        continue  // Song already marked with a token
      }
      var titleElmt = track.querySelector(".cell-title");
      // this refers here to the button itself this function was given as callback to
      var inPlaylists = this.library.getPlaylistsContainingTrack(track_id);
      if (inPlaylists.length) {  // track is in at least one playlist
        track.insertBefore(ElementBuilder.createAddedToken(inPlaylists), titleElmt);
        track.setAttribute('deezier-token', 1);
      }
    }
  }
  
}



console.log("DEEZIER");

async function process() {
  console.log("Start Deezier process ..");
  var lib = new MusicLibrary(ElementFinder.getProfileId());
  var area = new DeezierArea(lib);
  await lib.computePlaylists();
  console.log("Retrieving tracks from all playlists in library..");
  await lib.computeTracks();
  lib.display();
  console.log("Injecting Deezier area in left side panel..");
  area.injectInPage();
  console.log("End Deezier process ..");
}

setTimeout(process, 3000);

