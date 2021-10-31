// ==UserScript==
// @name        Deezier
// @namespace   Violentmonkey Scripts
// @match       https://www.deezer.*/*
// @grant       none
// @version     1.0
// @author      -
// @description Make Deezer better enhancing it with new features
// ==/UserScript==

const ID_LIBRARY_ELMT = 'deezier-library';
const ID_SCROLL_MONITOR_ELMT = 'deezier-scrollelmt';


class ElementBuilder {
  /* Create DOM elements */

  static createElement(name, properties={}) {
    const { id, classes, inner, attributes={}, style={}, children=[] } = properties;
    var elmt = document.createElement(name);
    if (id) { elmt.id = id; }
    if (classes) { elmt.className = classes; }
    if (inner) { elmt.innerText = inner; }
    Object.keys(attributes).map(k => { elmt.setAttribute(k, attributes[k]) });
    Object.assign(elmt.style, style);
    children.map(child => elmt.appendChild(child));
    return elmt;
  }

  static createInPlaylistToken(inPlaylists) {
    // Create a little visual marker meaning 'already present in a playlist'
    var tokenContent = this.createElement('div',{
      classes: "explicit outline small",
      inner: inPlaylists.length == 1 ? 'V' : inPlaylists.length,
      style: {color: 'green', 'border-color': 'green'}
    })
    return this.createElement('div', {
      classes: "datagrid-cell cell-explicit-small",
      attributes: {title: inPlaylists.join('\n')},
      children: [tokenContent]
    });
  }

  static createBtnDetectInPlaylistTracks() {
    // The button to trigger the adding of tokens
    var btnDetectInPlaylistTracks = this.createElement("button", {
      inner: "Detect Added Tracks",
      style: { padding: '5px', border: '1px solid', margin: '5px', 'margin-left': '20px'}
    });
    btnDetectInPlaylistTracks.addEventListener('click', () =>
                                               DeezierArea.getInstance().appendInPlaylistTokens());
    return btnDetectInPlaylistTracks;
  }

  static createSearchbar() {
    // A searchbar that will determines the content displayed in the list below
    var glass = this.createElement('div', {
      inner: "🔎",
      style: {float: 'left', margin: '2px 8px 1px 2px'}
    });
    var searchField = this.createElement('input', {
      attributes: {placeholder: "Search in playlists ...", type: "text"},
      style : {'border-style': 'none'}
    });
    var searchBar = this.createElement('div', {
      style: {border: '1px solid', margin:'20px 30px 5px 5px'},
      children: [glass, searchField]}
    );

    searchField.addEventListener("keyup", e => {
      const s = e.target.value;
    });
    return searchBar;
  }

  static createLibraryList() {
    // The frame where the list elements will live
    var list = this.createElement('div', {
      id: ID_LIBRARY_ELMT,
      style: {
        height: '250px',
        width: '200px',
        'overflow-y': 'scroll',
        border: '1px #aabbcc solid',
        padding: '10px'
	    }
    });
    return list;
  }

  static createLibraryListElmts() {
    // Build a list with created elements from all playlists in library
    var elmts = [];
    for (let [pId, playlist] of DeezierArea.getInstance().getLibrary()) {
      var playlistLinkElmt = this.createElement('a', {
        inner: `${playlist.title} (${playlist.length})`,
        attributes: {href: playlist.url}
      })
      elmts.push(this.createElement('div', {
        children: [playlistLinkElmt]
      }));
    }
    return elmts;
  }

  static createDeezierPanelArea() {
    // The global panel where Deezier's components live
    var area = document.createElement("div");
    area.appendChild(ElementBuilder.createBtnDetectInPlaylistTracks());
    area.appendChild(ElementBuilder.createSearchbar());
    area.appendChild(ElementBuilder.createLibraryList());
    return area;
  }
}


class ElementFinder {
  /* Find DOM elements */

  static getProfileId() {
    // Discover the user id by looking at current page
    var l = document.getElementsByClassName("sidebar-nav-link is-main");
    for (let e of l) {
      var res = e.href.match(/.*profile\/(\d+)/);
      if (res) { return res[1] }
    }
  }

  static getSidebar() {
    // Deezer original left sidebar, present in all views
    return document.getElementsByClassName("nano-content")[0];
  }

  static getTracksInPage() {
    // Build an array of tracks present in current page
    // TODO : deezer inject tracks incrementally when scrolling down, should simulate it before retrieving tracks
    return document.getElementsByClassName("datagrid-row song");
  }

  static getTrackIdFromElement(songElement) {
    var titleElmts = songElement.getElementsByClassName("datagrid-label-main title");
    if (!titleElmts.length) {
      return null
    }
    var urlToParse = titleElmts[0].getAttribute('href');
    return parseInt(urlToParse.substr(urlToParse.lastIndexOf('/')+1));
  }

  static getElmtToMonitorScrolling() {
    var datagridElmt = document.getElementsByClassName("datagrid");
    if (!datagridElmt.length) {
      return null;
    }
    var parent = datagridElmt[0];
    if (parent.childNodes.length > 1) {
      parent.childNodes[1].id = ID_SCROLL_MONITOR_ELMT;
      return parent.childNodes[1];
    }
  }

}


class DOM_Monitor {
  /* Manage observers on DOM elements */

  static SCROLLING_OBS = 'scrolling';

  constructor() {
    this.observers = {}
  }

  createObserver(name, domElmt, callback) {
    this.observers[name] = new MutationObserver(callback);
    this.observers[name].observe(domElmt, {attributes: true});
  }

  createScrollingObserver() {
    if (this.observers[this.SCROLLING_OBS] !== undefined) { return true }
    var elmtToMonitor = ElementFinder.getElmtToMonitorScrolling();
    if (elmtToMonitor == null) { return false }
    this.createObserver(this.SCROLLING_OBS, elmtToMonitor, () => DeezierArea.getInstance().appendInPlaylistTokens());
    return true;
  }

}


class MusicLibrary {
  /* For an user, maintain an index of his personal playlists and fill the tracks listed in */

  constructor(profileId) {
    this.profileId = profileId;
    this.playlists = {};
  }

  async computePlaylists() {
    // Fill the inner playlists object with metadata from the user playlists (not the tracks in yet)
    // The tracks field has to be filled afterwards calling fetchTracks()
    var pList = await this.fetchPlaylists();
    console.log("Fetched", pList.length, "playlists");
    pList.map(p => {
      this.playlists[p.id] = {
        url: p.url,
        title: p.title,
        length: p.length,
        tracks: {},  // <- will be filled once tracks fetched as well
        url_tracks: p.url_tracks,
        url_picture: p.url_picture,
        time_lastmodif: p.time_lastmodif
      };
    });
  }

  async computeTracks(playlistIds=[]) {
    // For each playlist in the library or given list, fetch the tracks in it, create an object indexed by track ids and
    // references this object in the property this.playlists.playlistId.tracks
    playlistIds = playlistIds.length > 0 ? playlistIds : Object.keys(this.playlists);
    for (let p of playlistIds) {
      var trackList = await this.fetchTracks(p);
      trackList.forEach(track => this.playlists[p]['tracks'][track.track_id] = track)
    }
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

  async fetchTracks(playlistId) {
    const response = await fetch(`${this.playlists[playlistId].url_tracks}&limit=1000`);
    const tracks = await response.json();
    return tracks.data.map(t => ({
      track_id : t.id,
      title: t.title,
      url: t.link,
      artist_id: t.artist.id,
      artist_name: t.artist.name,
      album_id: t.album.id,
      album_name: t.album.title
    }));
  }



  [Symbol.iterator]() {
    return Object.entries(this.playlists)[Symbol.iterator]();
  }

  getTracksInPlaylist(playlistId, onlyTrackIds=true) {
    if (this.playlists[playlistId] !== undefined) {
      return Object.entries(this.playlists[playlistId].tracks).map(([tId, track]) => onlyTrackIds ? tId : track);
    }
    return []
  }

  getAllTracks(onlyTrackIds=true) {
    var allTracks = [];
    Object.keys(this.playlists).map(pId => allTracks.push(...this.getTracksInPlaylist(pId, onlyTrackIds)));
    return allTracks;
  }

  getPlaylistsContainingTrack(trackId) {
    var inPlaylists = [];
    Object.entries(this.playlists).map(([pId, playlist]) => {
      if (this.getTracksInPlaylist(pId).includes(String(trackId))) { inPlaylists.push(playlist.title) }
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
  /* The place where all the stuff Deezier is working on is gathered, mapping in DOM as an area in sidebar */

  constructor(library) {
    if(!DeezierArea._instance) {
      DeezierArea._instance = this;
    }
    this.library = library;
    this.domObserver = new DOM_Monitor();
    this.panelArea = null;
    return DeezierArea._instance;
  }

  static getInstance() {
    return this._instance;
  }

  injectInPage() {
    // Inject the actual DOM area panel in the left side bar of Deezer interface
    this.panelArea = ElementBuilder.createDeezierPanelArea();
    ElementFinder.getSidebar().appendChild(this.panelArea);
    // Setup observers on DOM elements
    //TODO won't work if we're not on a playlist view : monitor elmt id page_loader to add at time it gets 'opened'  attr
    this.domObserver.createScrollingObserver();
  }

  appendInPlaylistTokens() {
    // Add a 'V' token in the frontend beside every song already present in a user's playlist
    var tracks = ElementFinder.getTracksInPage();
    console.log("Found", tracks.length, "tracks on this page !");
    // TODO : not very efficient to go through the whole library for each track >:(
    for (let track of tracks) {
      var trackId = ElementFinder.getTrackIdFromElement(track);
      if(track && track.getAttribute('deezier-token')) {
        continue  // Song unavailable or already marked with a token
      }
      var titleElmt = track.querySelector(".cell-title");
      var inPlaylists = this.library.getPlaylistsContainingTrack(trackId);
      if (inPlaylists.length) {  // track is in at least one playlist
        track.insertBefore(ElementBuilder.createInPlaylistToken(inPlaylists), titleElmt);
        track.setAttribute('deezier-token', 1);
      }
    }
  }

  refreshLibrary() {
    var libraryElmt = document.getElementById(ID_LIBRARY_ELMT);
    ElementBuilder.createLibraryListElmts().map(p => libraryElmt.appendChild(p));
  }

  getPanelArea() {
    return this.panelArea;
  }

  getLibrary() {
    return this.library;
  }

}



console.log("DEEZIER");

async function process() {
  console.log("Start Deezier process ..");
  var lib = new MusicLibrary(ElementFinder.getProfileId());
  var area = new DeezierArea(lib);
  await lib.computePlaylists();
  console.log("Retrieving tracks from all playlists in library..");
  lib.computeTracks(); // No await here to avoid blocking too much time
  lib.display();
  console.log("Injecting Deezier area in left side panel..");
  area.injectInPage();
  console.log("End Deezier process ..");
  area.refreshLibrary();
}

setTimeout(process, 2000);

