'use strict';

const ChromeStorage = require('../io/ChromeStorage');
const ChromeStorageNamespaces = require('../io/ChromeStorageNamespaces');
const LanguageUtils = require('../utils/LanguageUtils');
const Logger = require('../io/Logger');
const LocalLibrary = require('./model/LocalLibrary');
const DataUtils = require('../utils/DataUtils');
const Library = require('./model/Library');

/**
 * Library container. A container and manager for libraries defined by the user.
 * @author Haritz Medina <me@haritzmedina.com>
 */
class LibraryContainer{
  constructor(){
    this.localLibraries = [];
    this.syncLibraries = [];
    this.librarySearchInput = document.querySelector('#librarySearch');
    this.addLibraryButton = document.querySelector('#addLibraryButton');
  }

  /**
   * Initialize the library container (retrieves saved data from Chrome Storage) and initialize components behaviour
   * @param callback The callback function to execute after library container is initialized
   */
  init(callback) {
    // Prepare async promises
    let promises = [];
    // Load local saved libraries data from chrome storage
    promises.push(new Promise((resolve, reject) => {
      ChromeStorage.getData(ChromeStorageNamespaces.library.container, ChromeStorage.local, (error, result)=> {
        if(error){
          Logger.log(error);
        }
        this.localLibraries = [];
        if (!LanguageUtils.isEmptyObject(result)) {
          for(let i=0;i<result.length;i++){
            this.localLibraries.push(LanguageUtils.fillObject(new LocalLibrary(), result[i]));
          }
        }
        resolve();
      });
    }));
    // Load sync saved libraries data from chrome storage
    promises.push(new Promise((resolve, reject) => {
      ChromeStorage.getData(ChromeStorageNamespaces.library.container, ChromeStorage.sync, (error, result)=>{
        if(error){
          Logger.log(error);
        }
        this.syncLibraries = [];
        if (!LanguageUtils.isEmptyObject(result)) {
          for(let i=0;i<result.length;i++){
            // TODO Depending on Library is needed to create an object instead of 'new Library()'
            this.syncLibraries.push(LanguageUtils.fillObject(new Library(), result[i]));
          }
        }
        resolve();
      });
    }));
    Promise.all(promises).then(()=>{
      Logger.log(this.localLibraries);
      Logger.log(this.syncLibraries);
      callback();
    });

    // Handler of search input
    let searchEvent = (event)=>{
      let filterText = this.librarySearchInput.value;
      this.searchSongsByTextFilter(filterText, (songs)=>{
        if(songs.length===0){
          if(filterText.length===0){
            this.printLibraries();
          }
          else{
            this.printSearchEmpty();
          }
        }
        else{
          this.printSearchedSongs(songs);
        }
      });
    };
    this.librarySearchInput.addEventListener('search', searchEvent); // When clear button is clicked
    this.librarySearchInput.addEventListener('keyup', searchEvent); // When any text input is entered
    // Handler for add library button
    this.addLibraryButton.addEventListener('click', (event)=>{
      this.promptNewLocalLibraryForm();
    });
  }

  /**
   * Initialize libraries in the library container
   */
  loadLibraries(callback){
    // Clean libraries wrapper
    let container = document.getElementById('librarySearchResults');
    container.innerText = '';

    let promises = [];
    for(let i=0;i<this.localLibraries.length;i++){
      promises.push(new Promise((resolve, reject)=>{
        let localLibrary = this.localLibraries[i];
        localLibrary.loadLibrary(()=>{
          resolve();
        });
      }));
    }
    Promise.all(promises).then(()=>{
      this.updateChromeStorage(callback);
    });
  }

  printLibraries(callback){
    // TODO Check if it is better to hide and show a container or reprint everything
    let container = document.getElementById('librarySearchResults');
    container.innerText = '';

    for(let i=0;i<this.localLibraries.length;i++){
      this.localLibraries[i].printLibrary();
    }
  }

  /**
   * Add a new local library to the library container
   * @param library
   * @param callback
   */
  addLocalLibrary(library, callback){
    // Check if library is already added
    if(DataUtils.queryByExample(this.localLibraries, {absolutePath: library.absolutePath}).length===0){
      this.localLibraries.push(library);
      library.loadLibrary(()=>{
        // Update local library
        this.updateChromeStorage(callback);
      });
    }
    else{
      Logger.log('Already Added');
    }
  }

  updateChromeStorage(callback){
    ChromeStorage.setData(ChromeStorageNamespaces.library.container, this.localLibraries, ChromeStorage.local, ()=>{
      if(LanguageUtils.isFunction(callback)){
        callback();
      }
    });
  }

  removeLibrary(library, callback){
    // Remove library from local or sync (depending on where it is
    DataUtils.removeByExample(this.localLibraries, library);
    DataUtils.removeByExample(this.syncLibraries, library);
    // Reload libraries
    this.loadLibraries(()=>{
      // Update chrome storage
      this.updateChromeStorage(()=>{
        if(LanguageUtils.isFunction(callback)){
          callback();
        }
      });
    });
  }

  promptNewLocalLibraryForm(callback){
    chrome.fileSystem.chooseEntry({ type: 'openDirectory' }, (dirEntry)=>{
      // Save new folder reference on model
      if(dirEntry){
        let folderPointer = chrome.fileSystem.retainEntry(dirEntry);
        // TODO retrieve and save localpath and entrypoint
        chrome.fileSystem.getDisplayPath(dirEntry, (absolutePath) => {
          let localLibrary = new LocalLibrary(folderPointer, absolutePath);
          this.addLocalLibrary(localLibrary, ()=>{
            if(LanguageUtils.isFunction(callback)){
              callback();
            }
          });
        });
      }
      else{
        if(LanguageUtils.isFunction(callback)){
          callback();
        }
      }
    });
  }

  areLibrariesDefined(){
    return this.localLibraries.length+this.syncLibraries.length>0;
  }

  retrieveAllSongs(){
    let songs = [];
    for(let i=0;i<this.localLibraries.length;i++){
      songs = songs.concat(this.localLibraries[i].retrieveSongs());
    }
    return songs;
  }

  searchSongsByTextFilter(textFilter, callback){
    if(textFilter.length>0){
      let results = [];
      let promises = [];
      for(let i=0;i<this.localLibraries.length;i++){
        promises.push(new Promise((resolve, reject)=>{
          results = results.concat(this.localLibraries[i].getSongsByTextFilter(textFilter));
          resolve();
        }));
      }
      Promise.all(promises).then(()=>{
        if(LanguageUtils.isFunction(callback)){
          callback(results);
        }
      });
    }
    else{
      if(LanguageUtils.isFunction(callback)){
        callback([]);
      }
    }
  }

  printSearchedSongs(songs){
    let container = document.getElementById('librarySearchResults');
    container.innerText = '';

    for(let i=0;i<songs.length;i++){
      songs[i].printLibrarySong(container);
    }
  }

  printSearchEmpty() {
    let container = document.getElementById('librarySearchResults');
    container.innerText = 'No songs found';
  }
}

module.exports = LibraryContainer;