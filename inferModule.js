var path = require("path");
var glob = require("glob");
var env = require("jsdoc/env");
var NodeCache = require( "node-cache" );

/* global process, exports */

var config = env.conf.inferModule || {};
var myCache = new NodeCache();
var err;

exports.handlers = {
  parseBegin: function(e) {
    // Try to retrieve cached files, otherwise cache the exlcuded files.
    try {
      myCache.get( "excludedFiles", true );
    } catch( err ) {

      var excludeArr = [];

      e.sourcefiles.map(function fileMap(file) {
        var parsedPath = path.parse(file);
        var relPath = parsedPath.dir.replace(process.cwd() + "/", "");
        relPath = relPath + "/" + parsedPath.base;

        // Set the relative file path in cache for later module naming.
        myCache.set(file, relPath);

        // If the exclude object is present, test for files to exclude.
        if (config.exclude !== undefined) {

          config.exclude.map(function excludeMap(item) {
            return glob.sync(item).map(function globMap(match) {
              if (relPath === match) {
                excludeArr.push(match);
              }
              return true;
            });
          });
        };
      });

      myCache.set( "excludedFiles", excludeArr, function( err, success ){
        if( !err && success ){
          if (!success) {
            var err = new Error("Exclude file parsing failed.");
            throw (err);
          }
        }
      });
    }
  }
};

exports.astNodeVisitor = {
  visitNode: function find(node, e, parser, currentSourceName) {
    "use strict";

    if (node.comments !== undefined) {
      // Retrieve the relative file path from cache.
      var relPath = myCache.get(currentSourceName);

      // If the file is one to be excluded, return.
      if (myCache.get("excludedFiles").indexOf(relPath) != -1) {
        return;
      }

      // If the comment is non-existant, or a one-line comment (e.g., a
      // `@lends` tag), then create a new comment for the file.
      if (node.comments[0] === undefined) {
        err = new Error("No toplevel comment for JSDoc in " +
                              currentSourceName);
        throw (err);
      }

      // If the configuration file is empty, do nothing. Otherwise store
      // value in conf.
      if (config.schema === undefined) {
        err = new Error("No 'schema' key is defined in " +
                              "inferModule's configuration.");
        throw (err);
      }

      // If the JSDoc comment already has a module tag, do not process.
      if (/@module/.test(node.comments[0].raw)) {
        return;
      }

      // Call the map method to check if an object in the inferModule
      // array is applicable. If it is, then update relPath to the change.
      config.schema.map(function schemaMap(item) {
        var re = new RegExp(item.from);

        if (relPath !== relPath.replace(re, item.to)) {
          relPath = relPath.replace(re, item.to);
        }
        return relPath;
      });

      // Parse the path regardless if it has been altered. This is
      // necessary because if a module with the .js extension is added to
      // the file, the output will just be "js".
      var mod = path.parse(relPath);

      // If the comment does not have a module tag, then add one that is
      // the concatenated replacement string and extensionless filename.
      var comment = node.comments[0].raw.split("\n");
      var divider = mod.dir !== "" ? "/" : "";
      var moduleName = mod.dir + divider + mod.name;

      comment.splice(1, 0, " * @module " + moduleName);
      node.comments[0].raw = comment.join("\n");
    }
  },
};
