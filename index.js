/*
 *  Copyright (c) 2014, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

var React = require('react');
var ReactDOMServer = require('react-dom/server');
var Provider = require('react-redux').Provider;
var beautifyHTML = require('js-beautify').html;
var assign = require('object-assign');
var _escaperegexp = require('lodash.escaperegexp');

var DEFAULT_OPTIONS = {
	doctype: '<!DOCTYPE html>',
	beautify: false,
	transformViews: true,
	babel: {
		presets: ['react', 'es2015',]
	}
};

function createEngine(engineOptions) {
	var registered = false;
	var moduleDetectRegEx;

	engineOptions = assign({}, DEFAULT_OPTIONS, engineOptions || {});

	function renderFile(filename, options, cb) {
		// Defer babel registration until the first request so we can grab the view path.
		if (!moduleDetectRegEx) {
			// Path could contain regexp characters so escape it first.
			moduleDetectRegEx = new RegExp('^' + _escaperegexp(options.settings.views));
		}
		if (engineOptions.transformViews && !registered) {
			// Passing a RegExp to Babel results in an issue on Windows so we'll just
			// pass the view path.
			require('babel-register')(assign({
				only: options.settings.views
			}, engineOptions.babel));
			registered = true;
			require.extensions['.scss'] = function () {};
			require.extensions['.css'] = function () {};
		}

		var resultMarkup;

		try {
			var viewParts = require(filename);
			// Transpiled ES6 may export components as { default: Component }
			viewParts = viewParts.default || viewParts;

			var locals = options.res.locals;

			var store = viewParts.getStore(locals);
			var ViewComponent = viewParts.Component;

			resultMarkup = engineOptions.doctype;
			var componentMarkup = ReactDOMServer.renderToString(React.createElement(Provider, {
				store: store
			}, React.createElement(ViewComponent)));

			resultMarkup += viewParts.pre(locals, store);
			resultMarkup += componentMarkup;
			resultMarkup += viewParts.post(locals, store);
		} catch (e) {
			return cb(e);
		} finally {
			if (options.settings.env === 'development') {
				// Remove all files from the module cache that are in the view folder.
				Object.keys(require.cache).forEach(function(module) {
					if (moduleDetectRegEx.test(require.cache[module].filename)) {
						delete require.cache[module];
					}
				});
			}
		}

		if (engineOptions.beautify) {
			// NOTE: This will screw up some things where whitespace is important, and be
			// subtly different than prod.
			resultMarkup = beautifyHTML(resultMarkup);
		}

		cb(null, resultMarkup);
	}

	return renderFile;
}

exports.createEngine = createEngine;
