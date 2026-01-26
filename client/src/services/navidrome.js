import CryptoJS from 'crypto-js';

class NavidromeClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.username = null;
    this.token = null;
    this.salt = null;
  }

  /**
   * Generate token and salt for Subsonic API authentication
   */
  generateAuth(password) {
    const salt = Math.random().toString(36).substring(2, 15);
    const token = CryptoJS.MD5(password + salt).toString();
    return { token, salt };
  }

  /**
   * Build Subsonic API URL with auth params
   */
  buildUrl(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}/rest/${endpoint}`);

    url.searchParams.append('u', this.username);
    url.searchParams.append('t', this.token);
    url.searchParams.append('s', this.salt);
    url.searchParams.append('v', '1.16.1');
    url.searchParams.append('c', 'navidrome-jam');
    url.searchParams.append('f', 'json');

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });

    return url.toString();
  }

  /**
   * Authenticate with Navidrome
   */
  async authenticate(username, password) {
    const { token, salt } = this.generateAuth(password);

    // Test authentication with ping
    const url = new URL(`${this.baseUrl}/rest/ping`);
    url.searchParams.append('u', username);
    url.searchParams.append('t', token);
    url.searchParams.append('s', salt);
    url.searchParams.append('v', '1.16.1');
    url.searchParams.append('c', 'navidrome-jam');
    url.searchParams.append('f', 'json');

    const response = await fetch(url);
    const data = await response.json();

    if (data['subsonic-response'].status !== 'ok') {
      throw new Error(data['subsonic-response'].error?.message || 'Authentication failed');
    }

    // Store credentials
    this.username = username;
    this.token = token;
    this.salt = salt;

    // Store in localStorage
    localStorage.setItem('navidrome_username', username);
    localStorage.setItem('navidrome_token', token);
    localStorage.setItem('navidrome_salt', salt);

    return data['subsonic-response'];
  }

  /**
   * Restore session from localStorage
   */
  restoreSession() {
    const username = localStorage.getItem('navidrome_username');
    const token = localStorage.getItem('navidrome_token');
    const salt = localStorage.getItem('navidrome_salt');

    if (username && token && salt) {
      this.username = username;
      this.token = token;
      this.salt = salt;
      return true;
    }

    return false;
  }

  /**
   * Logout
   */
  logout() {
    this.username = null;
    this.token = null;
    this.salt = null;
    localStorage.removeItem('navidrome_username');
    localStorage.removeItem('navidrome_token');
    localStorage.removeItem('navidrome_salt');
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return !!(this.username && this.token && this.salt);
  }

  /**
   * Fetch from Subsonic API
   */
  async fetch(endpoint, params = {}) {
    const url = this.buildUrl(endpoint, params);
    const response = await fetch(url);
    const data = await response.json();

    if (data['subsonic-response'].status !== 'ok') {
      throw new Error(data['subsonic-response'].error?.message || 'API request failed');
    }

    return data['subsonic-response'];
  }

  /**
   * Get streaming URL for a song
   */
  getStreamUrl(songId, format = null, maxBitRate = null) {
    const params = { id: songId };
    if (format) params.format = format;
    if (maxBitRate) params.maxBitRate = maxBitRate;
    return this.buildUrl('stream.view', params);
  }

  /**
   * Get cover art URL
   */
  getCoverArtUrl(id, size = null) {
    const params = { id };
    if (size) params.size = size;
    return this.buildUrl('getCoverArt.view', params);
  }

  /**
   * Search for songs, albums, artists
   */
  async search(query, artistCount = 10, albumCount = 10, songCount = 20) {
    return this.fetch('search3.view', {
      query,
      artistCount,
      albumCount,
      songCount
    });
  }

  /**
   * Get album details
   */
  async getAlbum(id) {
    return this.fetch('getAlbum.view', { id });
  }

  /**
   * Get artist details
   */
  async getArtist(id) {
    return this.fetch('getArtist.view', { id });
  }

  /**
   * Get song details
   */
  async getSong(id) {
    return this.fetch('getSong.view', { id });
  }

  /**
   * Get random songs
   */
  async getRandomSongs(size = 50, genre = null) {
    const params = { size };
    if (genre) params.genre = genre;
    return this.fetch('getRandomSongs.view', params);
  }

  /**
   * Scrobble (mark as played)
   */
  async scrobble(id, submission = true) {
    return this.fetch('scrobble.view', {
      id,
      submission,
      time: Date.now()
    });
  }

  /**
   * Get playlists
   */
  async getPlaylists() {
    return this.fetch('getPlaylists.view');
  }

  /**
   * Get playlist details
   */
  async getPlaylist(id) {
    return this.fetch('getPlaylist.view', { id });
  }
}

export default NavidromeClient;
