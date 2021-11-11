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

class Util {

  static stringsSimilar(baseStr, againstStr) {
    return (baseStr === againstStr); //TODO
  }

}

class ElementBuilder {
  /* Create DOM elements */

  static createElement(name, properties={}) {
    const { id, classes, inner, innerHtml, attributes={}, style={}, children=[] } = properties;
    var elmt = document.createElement(name);
    if (id) { elmt.id = id; }
    if (classes) { elmt.className = classes; }
    if (inner) { elmt.innerText = inner; }
    if (innerHtml) { elmt.innerHTML = innerHtml; }
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
    });
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
      const tomatch = e.target.value;
      if (tomatch.length < 3) {
        if (tomatch.length == 0) {
          DeezierArea.getInstance().setLibraryViewPlaylists();
        }
        return; // TODO If comes back to 0 reset view to get rid of research
      }
      const matches = DeezierArea.getInstance().searchInLibrary(tomatch);
      DeezierArea.getInstance().setLibraryViewSearchResults(matches);
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
      });
      elmts.push(this.createElement('div', {
        children: [playlistLinkElmt]
      }));
    }
    return elmts;
  }

  static createLibrarySearchResultsElmts(searchResults) {
    var elmts = [];
    var lib = DeezierArea.getInstance().getLibrary();
    Object.entries(searchResults).map(([pId, results]) => {
      var playlist = lib.getPlaylist(pId);
      var children = [];
      // Name of playlist we fond results in
      children.push(this.createElement('a', {
        innerHtml:`<b>[   ${playlist.title} (${results.title.length + results.artist.length})   ]</b>`,
        attributes: {href: playlist.url}
      }));
      // Elements in first serie under playlist name are matches on the song title
      results.title.map((track, i, {length}) => {
        children.push(this.createElement('br'));
        var branchStyle = i == length-1 ? (results.artist.length ? '┡' : '┗') : '┣';
        children.push(this.createElement('a', {
          innerHtml: `  ${branchStyle} <i><b>${track.title}</b></i> - ${track.artist_name}`,
          attributes: {href: track.url},
          style: {'white-space': 'nowrap'}
        }));
      });
      // Elements in second serie under playlist name are matches on the artist name
      results.artist.map((track, i, {length}) => {
        children.push(this.createElement('br'));
        var branchStyle = i == length-1 ? '┗' : '┣';
        children.push(this.createElement('a', {
          innerHtml: `  ${branchStyle} <i><b>${track.title}</b></i> - ${track.artist_name}`,
          attributes: {href: track.url},
          style: {'white-space': 'nowrap'}
        }));
      });
      elmts.push(this.createElement('div', {
        children: children
      }));
    });
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

  static OBFUSCATED = {
    track: 'JoTQr',
    album: '_10fIC',
    track_title: '_2tIhH'
  };

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
    // Build an array of tracks present in current page (beware Deezer adjust it dynamically when scrolling)
    var tracks = document.getElementsByClassName("datagrid-row song");
    if (!tracks.length) {
      tracks = document.getElementsByClassName(this.OBFUSCATED.track);
    }
    return tracks;
  }

  static getTrackIdFromElement(trackElement) {
    var titleElmts = trackElement.getElementsByClassName("datagrid-label-main title");
    if (!titleElmts.length) {
      return null;
    }
    var urlToParse = titleElmts[0].getAttribute('href');
    return parseInt(urlToParse.substr(urlToParse.lastIndexOf('/')+1));
  }

  static getTrackInfosFromElement(trackElement) {
    const titleElmt = trackElement.getElementsByClassName(this.OBFUSCATED.track_title)[0];
    const albumElmt = trackElement.getElementsByClassName(this.OBFUSCATED.album)[0];
    const artistElmt = albumElmt.previousSibling;
    return {
      title: titleElmt.innerText, title_elmt: titleElmt,
      album_name: albumElmt.innerText, album_id: albumElmt.firstElementChild.firstElementChild.getAttribute('href').split('/').pop(),
      artist: artistElmt.innerText, artist_id: artistElmt.firstElementChild.firstElementChild.getAttribute('href').split('/').pop()
    };
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
    this.artists = {};
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
        creator: p.creator,
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
      trackList.forEach(t => {
        this.playlists[p]['tracks'][t.track_id] = t;
        const artist = this.addArtist(t.artist_id, t.artist_name);
        const album = this.addAlbumToArtist(t.artist_id, t.album_id, t.album_name);
        const track = this.addTrackToArtistAlbum(t.artist_id, t.album_id, t.track_id, t.title, p);

        if (!track['inPlaylists'].includes(p)) {
          track['inPlaylists'].push(p);
        }
      });
    }
  }

  async fetchPlaylists() {
    // Get URIs list of all personal playlists from the given user, where a playlist is an object gathering useful fields about it
    const response = await fetch(`https://api.deezer.com/user/${this.profileId}/playlists&limit=1000`);
    const playlists = await response.json();
    return playlists.data.map(p => ({
      id: p.id,
      url: p.link,
      title: p.title,
      length: p.nb_tracks,
      creator: p.creator.id,
      url_tracks: p.tracklist,
      url_picture: p.picture,
      time_lastmodif: p.time_mod
    }));
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
      artist_url: t.artist.link,
      album_id: t.album.id,
      album_name: t.album.title,
      album_url: t.album.tracklist
    }));
  }

  [Symbol.iterator]() {
    return Object.entries(this.playlists)[Symbol.iterator]();
  }

  addArtist(artistId, artistName) {
    const currArtist = this.artists[artistId];
    if (currArtist) { return currArtist }
    const newArtist = {
      artist_name: artistName,
      albums: { }
    };
    this.artists[artistId] = newArtist;
    return newArtist;
  }

  addAlbumToArtist(artistId, albumId, albumName) {
    const currAlbum = this.artists[artistId]['albums'][albumId];
    if (currAlbum) { return currAlbum }
    const newAlbum = {
      album_name: albumName,
      album_tracks: { }
    };
    this.artists[artistId]['albums'][albumId] = newAlbum;
    return newAlbum;
  }

  addTrackToArtistAlbum(artistId, albumId, trackId, trackName, inPlaylist) {
    const currTrack = this.artists[artistId]['albums'][albumId]['album_tracks'][trackId];
    if (currTrack) { return currTrack }
    const newTrack = {
      title: trackName,
      inPlaylists: [inPlaylist]
    };
    this.artists[artistId]['albums'][albumId]['album_tracks'][trackId] = newTrack;
    return newTrack;
  }


  getPlaylist(id) {
    return this.playlists[id];
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

  getPlaylistsContainingTrack(trackId, lovedTracksPlaylist=false, otherUserPlaylists=false) {
    var inPlaylists = [];
    Object.entries(this.playlists).map(([pId, playlist]) => {
      const isOwnUserPlaylist = (playlist.creator == ElementFinder.getProfileId());
      if (otherUserPlaylists || isOwnUserPlaylist) {
        if (lovedTracksPlaylist || playlist.title != "Loved Tracks" || !isOwnUserPlaylist) {
          if (this.getTracksInPlaylist(pId).includes(String(trackId))) {
            inPlaylists.push(playlist.title);
          }
        }
      }
    });
    return inPlaylists;
  }

  searchMathingTracks(tomatch) {
    // From the playlists, retrieve all tracks matching a pattern (used in track research). Returns an object
    // indexed by playlist id in which a match is found, either on the track title or the artist (separated in 2 arrays)
    const re = RegExp(tomatch, 'i');
    const matchedPlaylists = {};
    Object.entries(this.playlists).map(([pId, playlist]) => {
      var matches = { title: [], artist: [] };
      Object.values(playlist.tracks).map(track => {
        var matchCategory = null;
        if (re.test(track.title) && !matches.title.filter(m => m.id === track.track_id).length) {
          matchCategory = matches.title;
        }
        if (re.test(track.artist_name) && !matches.artist.filter(m => m.id === track.track_id).length) {
          matchCategory = matches.artist;
        }
        matchCategory !== null && matchCategory.push(Object.assign({}, track));
      });
      if (matches.title.length || matches.artist.length) {
        matchedPlaylists[pId] = matches;
      }
    });
    return matchedPlaylists;
  }

  getArtist(id) {
    return this.artists[id] || null;
  }

  getAlbumsFromArtist(artistId) {
    const artist = this.getArtist(artistId);
    if (!artist) { return null }
    return artist['albums'];
  }

  getAlbumTracksFromArtist(artistId, albumId) {
    // From the known artists, return the album object if it exists or null
    const artist = this.getArtist(artistId);
    if (!artist) { return null }
    return artist['albums'][albumId] || null;
  }

  getPlaylistsMatchingTrackFromArtist(artistId, trackTitle, albumId=null, onlySimilarTracks=false) {
    // Sometimes we don't have the track id itself (only title), so we use known artist stuff to determine if
    // the track is present in the library. Returns an array of playlist names the track is in.
    const inPlaylists = [];
    if (albumId) {
      const albumTracks = this.getAlbumTracksFromArtist(artistId, albumId);
      Object.entries(albumTracks).map(([id, albumTrack]) => {
        if (onlySimilarTracks) {
          if (Util.stringsSimilar(trackTitle, albumTrack.title)) {
            inPlaylists.push(Object.assign(albumTrack, { id: id }));
          }
        } else if (albumTrack.title === trackTitle) {
          inPlaylists.push(... albumTrack.inPlaylists);
        }
      });
      return [... new Set(inPlaylists)];
    } else {
      return Object.keys(this.getAlbumsFromArtist(artistId)).foreach(albumId => {
        inPlaylists.push(... this.getMatchingTrackFromArtist(artistId, trackTitle, albumId, onlySimilarTracks));
      });
    }
    return inPlaylists;
  }

  display() {
    console.log("Music library for user", this.profileId, '\nPlaylists:', this.playlists, '\nArtists', this.artists);
  }

}


class DeezierArea {
  /* The place where all the stuff Deezier is working on is gathered, mapping in DOM as an area in sidebar */

  constructor(library) {
    if(!DeezierArea._instance) {
      DeezierArea._instance = this;
    }
    this.library = library;
    this.libraryViewElmt = null;
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
    this.libraryViewElmt = document.getElementById(ID_LIBRARY_ELMT);
    this.setLibraryViewPlaylists();
    // Setup observers on DOM elements
    this.domObserver.createScrollingObserver();
  }

  appendInPlaylistTokens() {
    // Add a 'V' token in the frontend beside every song already present in a user's playlist
    var tracks = ElementFinder.getTracksInPage();
    console.log("Found", tracks.length, "tracks on this page !");
    // TODO : not very efficient to go through the whole library for each track >:(
    for (let track of tracks) {
      if(track && track.getAttribute('deezier-token')) {
          continue  // Song unavailable or already marked with a token
      }
      var titleElmt, inPlaylistsName;
      var trackId = ElementFinder.getTrackIdFromElement(track);
      if (trackId) {
        titleElmt = track.querySelector(".cell-title");
        inPlaylistsName = this.library.getPlaylistsContainingTrack(trackId);
      } else {  // Likely we are in the case classnames are obfuscated
        const trackInfos = ElementFinder.getTrackInfosFromElement(track);
        console.log(trackInfos);
        titleElmt = trackInfos.title_elmt;
        const inPlaylistsId = this.library.getPlaylistsMatchingTrackFromArtist(trackInfos.artist_id, trackInfos.title, trackInfos.album_id);
        inPlaylistsName = inPlaylistsId.map(pId => this.library.getPlaylist(pId).title);
      }
      if (inPlaylists.length) {  // track is in at least one playlist
        track.insertBefore(ElementBuilder.createInPlaylistToken(inPlaylists), titleElmt);
        track.setAttribute('deezier-token', 1);
      }
    }
  }

  searchInLibrary(tomatch) {
    // TODO some cache system when typing a new following letter, only look in previous result because we narrow down
    return this.library.searchMathingTracks(tomatch)
  }

  cleanLibraryView() {
    while (this.libraryViewElmt.firstChild) { this.libraryViewElmt.firstChild.remove() }
  }

  setLibraryViewPlaylists() {
    this.cleanLibraryView();
    this.libraryViewElmt.style.removeProperty('overflow-x');
    ElementBuilder.createLibraryListElmts().map(p => this.libraryViewElmt.appendChild(p));
  }

  setLibraryViewSearchResults(searchResults) {
    this.cleanLibraryView();
    this.libraryViewElmt.style['overflow-x'] = 'scroll';
    ElementBuilder.createLibrarySearchResultsElmts(searchResults).map(p => this.libraryViewElmt.appendChild(p));
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
  lib.computeTracks(playlistIds=[]); // No await here to avoid blocking too much time
  lib.display();
  console.log("Injecting Deezier area in left side panel..");
  area.injectInPage();
  console.log("End Deezier process ..");
}

setTimeout(process, 2000);


