(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/** @license
 * crossroads <http://millermedeiros.github.com/crossroads.js/>
 * Author: Miller Medeiros | MIT License
 * v0.12.2 (2015/07/31 18:37)
 */

(function () {
var factory = function (signals) {

    var crossroads,
        _hasOptionalGroupBug,
        UNDEF;

    // Helpers -----------
    //====================

    // IE 7-8 capture optional groups as empty strings while other browsers
    // capture as `undefined`
    _hasOptionalGroupBug = (/t(.+)?/).exec('t')[1] === '';

    function arrayIndexOf(arr, val) {
        if (arr.indexOf) {
            return arr.indexOf(val);
        } else {
            //Array.indexOf doesn't work on IE 6-7
            var n = arr.length;
            while (n--) {
                if (arr[n] === val) {
                    return n;
                }
            }
            return -1;
        }
    }

    function arrayRemove(arr, item) {
        var i = arrayIndexOf(arr, item);
        if (i !== -1) {
            arr.splice(i, 1);
        }
    }

    function isKind(val, kind) {
        return '[object '+ kind +']' === Object.prototype.toString.call(val);
    }

    function isRegExp(val) {
        return isKind(val, 'RegExp');
    }

    function isArray(val) {
        return isKind(val, 'Array');
    }

    function isFunction(val) {
        return typeof val === 'function';
    }

    //borrowed from AMD-utils
    function typecastValue(val) {
        var r;
        if (val === null || val === 'null') {
            r = null;
        } else if (val === 'true') {
            r = true;
        } else if (val === 'false') {
            r = false;
        } else if (val === UNDEF || val === 'undefined') {
            r = UNDEF;
        } else if (val === '' || isNaN(val)) {
            //isNaN('') returns false
            r = val;
        } else {
            //parseFloat(null || '') returns NaN
            r = parseFloat(val);
        }
        return r;
    }

    function typecastArrayValues(values) {
        var n = values.length,
            result = [];
        while (n--) {
            result[n] = typecastValue(values[n]);
        }
        return result;
    }

    // borrowed from MOUT
    function decodeQueryString(queryStr, shouldTypecast) {
        var queryArr = (queryStr || '').replace('?', '').split('&'),
            reg = /([^=]+)=(.+)/,
            i = -1,
            obj = {},
            equalIndex, cur, pValue, pName;

        while ((cur = queryArr[++i])) {
            equalIndex = cur.indexOf('=');
            pName = cur.substring(0, equalIndex);
            pValue = decodeURIComponent(cur.substring(equalIndex + 1));
            if (shouldTypecast !== false) {
                pValue = typecastValue(pValue);
            }
            if (pName in obj){
                if(isArray(obj[pName])){
                    obj[pName].push(pValue);
                } else {
                    obj[pName] = [obj[pName], pValue];
                }
            } else {
                obj[pName] = pValue;
           }
        }
        return obj;
    }


    // Crossroads --------
    //====================

    /**
     * @constructor
     */
    function Crossroads() {
        this.bypassed = new signals.Signal();
        this.routed = new signals.Signal();
        this._routes = [];
        this._prevRoutes = [];
        this._piped = [];
        this.resetState();
    }

    Crossroads.prototype = {

        greedy : false,

        greedyEnabled : true,

        ignoreCase : true,

        ignoreState : false,

        shouldTypecast : false,

        normalizeFn : null,

        resetState : function(){
            this._prevRoutes.length = 0;
            this._prevMatchedRequest = null;
            this._prevBypassedRequest = null;
        },

        create : function () {
            return new Crossroads();
        },

        addRoute : function (pattern, callback, priority) {
            var route = new Route(pattern, callback, priority, this);
            this._sortedInsert(route);
            return route;
        },

        removeRoute : function (route) {
            arrayRemove(this._routes, route);
            route._destroy();
        },

        removeAllRoutes : function () {
            var n = this.getNumRoutes();
            while (n--) {
                this._routes[n]._destroy();
            }
            this._routes.length = 0;
        },

        parse : function (request, defaultArgs) {
            request = request || '';
            defaultArgs = defaultArgs || [];

            // should only care about different requests if ignoreState isn't true
            if ( !this.ignoreState &&
                (request === this._prevMatchedRequest ||
                 request === this._prevBypassedRequest) ) {
                return;
            }

            var routes = this._getMatchedRoutes(request),
                i = 0,
                n = routes.length,
                cur;

            if (n) {
                this._prevMatchedRequest = request;

                this._notifyPrevRoutes(routes, request);
                this._prevRoutes = routes;
                //should be incremental loop, execute routes in order
                while (i < n) {
                    cur = routes[i];
                    cur.route.matched.dispatch.apply(cur.route.matched, defaultArgs.concat(cur.params));
                    cur.isFirst = !i;
                    this.routed.dispatch.apply(this.routed, defaultArgs.concat([request, cur]));
                    i += 1;
                }
            } else {
                this._prevBypassedRequest = request;
                this.bypassed.dispatch.apply(this.bypassed, defaultArgs.concat([request]));
            }

            this._pipeParse(request, defaultArgs);
        },

        _notifyPrevRoutes : function(matchedRoutes, request) {
            var i = 0, prev;
            while (prev = this._prevRoutes[i++]) {
                //check if switched exist since route may be disposed
                if(prev.route.switched && this._didSwitch(prev.route, matchedRoutes)) {
                    prev.route.switched.dispatch(request);
                }
            }
        },

        _didSwitch : function (route, matchedRoutes){
            var matched,
                i = 0;
            while (matched = matchedRoutes[i++]) {
                // only dispatch switched if it is going to a different route
                if (matched.route === route) {
                    return false;
                }
            }
            return true;
        },

        _pipeParse : function(request, defaultArgs) {
            var i = 0, route;
            while (route = this._piped[i++]) {
                route.parse(request, defaultArgs);
            }
        },

        getNumRoutes : function () {
            return this._routes.length;
        },

        _sortedInsert : function (route) {
            //simplified insertion sort
            var routes = this._routes,
                n = routes.length;
            do { --n; } while (routes[n] && route._priority <= routes[n]._priority);
            routes.splice(n+1, 0, route);
        },

        _getMatchedRoutes : function (request) {
            var res = [],
                routes = this._routes,
                n = routes.length,
                route;
            //should be decrement loop since higher priorities are added at the end of array
            while (route = routes[--n]) {
                if ((!res.length || this.greedy || route.greedy) && route.match(request)) {
                    res.push({
                        route : route,
                        params : route._getParamsArray(request)
                    });
                }
                if (!this.greedyEnabled && res.length) {
                    break;
                }
            }
            return res;
        },

        pipe : function (otherRouter) {
            this._piped.push(otherRouter);
        },

        unpipe : function (otherRouter) {
            arrayRemove(this._piped, otherRouter);
        },

        toString : function () {
            return '[crossroads numRoutes:'+ this.getNumRoutes() +']';
        }
    };

    //"static" instance
    crossroads = new Crossroads();
    crossroads.VERSION = '0.12.2';

    crossroads.NORM_AS_ARRAY = function (req, vals) {
        return [vals.vals_];
    };

    crossroads.NORM_AS_OBJECT = function (req, vals) {
        return [vals];
    };


    // Route --------------
    //=====================

    /**
     * @constructor
     */
    function Route(pattern, callback, priority, router) {
        var isRegexPattern = isRegExp(pattern),
            patternLexer = router.patternLexer;
        this._router = router;
        this._pattern = pattern;
        this._paramsIds = isRegexPattern? null : patternLexer.getParamIds(pattern);
        this._optionalParamsIds = isRegexPattern? null : patternLexer.getOptionalParamsIds(pattern);
        this._matchRegexp = isRegexPattern? pattern : patternLexer.compilePattern(pattern, router.ignoreCase);
        this.matched = new signals.Signal();
        this.switched = new signals.Signal();
        if (callback) {
            this.matched.add(callback);
        }
        this._priority = priority || 0;
    }

    Route.prototype = {

        greedy : false,

        rules : void(0),

        match : function (request) {
            request = request || '';
            return this._matchRegexp.test(request) && this._validateParams(request); //validate params even if regexp because of `request_` rule.
        },

        _validateParams : function (request) {
            var rules = this.rules,
                values = this._getParamsObject(request),
                key;
            for (key in rules) {
                // normalize_ isn't a validation rule... (#39)
                if(key !== 'normalize_' && rules.hasOwnProperty(key) && ! this._isValidParam(request, key, values)){
                    return false;
                }
            }
            return true;
        },

        _isValidParam : function (request, prop, values) {
            var validationRule = this.rules[prop],
                val = values[prop],
                isValid = false,
                isQuery = (prop.indexOf('?') === 0);

            if (val == null && this._optionalParamsIds && arrayIndexOf(this._optionalParamsIds, prop) !== -1) {
                isValid = true;
            }
            else if (isRegExp(validationRule)) {
                if (isQuery) {
                    val = values[prop +'_']; //use raw string
                }
                isValid = validationRule.test(val);
            }
            else if (isArray(validationRule)) {
                if (isQuery) {
                    val = values[prop +'_']; //use raw string
                }
                isValid = this._isValidArrayRule(validationRule, val);
            }
            else if (isFunction(validationRule)) {
                isValid = validationRule(val, request, values);
            }

            return isValid; //fail silently if validationRule is from an unsupported type
        },

        _isValidArrayRule : function (arr, val) {
            if (! this._router.ignoreCase) {
                return arrayIndexOf(arr, val) !== -1;
            }

            if (typeof val === 'string') {
                val = val.toLowerCase();
            }

            var n = arr.length,
                item,
                compareVal;

            while (n--) {
                item = arr[n];
                compareVal = (typeof item === 'string')? item.toLowerCase() : item;
                if (compareVal === val) {
                    return true;
                }
            }
            return false;
        },

        _getParamsObject : function (request) {
            var shouldTypecast = this._router.shouldTypecast,
                values = this._router.patternLexer.getParamValues(request, this._matchRegexp, shouldTypecast),
                o = {},
                n = values.length,
                param, val;
            while (n--) {
                val = values[n];
                if (this._paramsIds) {
                    param = this._paramsIds[n];
                    if (param.indexOf('?') === 0 && val) {
                        //make a copy of the original string so array and
                        //RegExp validation can be applied properly
                        o[param +'_'] = val;
                        //update vals_ array as well since it will be used
                        //during dispatch
                        val = decodeQueryString(val, shouldTypecast);
                        values[n] = val;
                    }
                    // IE will capture optional groups as empty strings while other
                    // browsers will capture `undefined` so normalize behavior.
                    // see: #gh-58, #gh-59, #gh-60
                    if ( _hasOptionalGroupBug && val === '' && arrayIndexOf(this._optionalParamsIds, param) !== -1 ) {
                        val = void(0);
                        values[n] = val;
                    }
                    o[param] = val;
                }
                //alias to paths and for RegExp pattern
                o[n] = val;
            }
            o.request_ = shouldTypecast? typecastValue(request) : request;
            o.vals_ = values;
            return o;
        },

        _getParamsArray : function (request) {
            var norm = this.rules? this.rules.normalize_ : null,
                params;
            norm = norm || this._router.normalizeFn; // default normalize
            if (norm && isFunction(norm)) {
                params = norm(request, this._getParamsObject(request));
            } else {
                params = this._getParamsObject(request).vals_;
            }
            return params;
        },

        interpolate : function(replacements) {
            var str = this._router.patternLexer.interpolate(this._pattern, replacements);
            if (! this._validateParams(str) ) {
                throw new Error('Generated string doesn\'t validate against `Route.rules`.');
            }
            return str;
        },

        dispose : function () {
            this._router.removeRoute(this);
        },

        _destroy : function () {
            this.matched.dispose();
            this.switched.dispose();
            this.matched = this.switched = this._pattern = this._matchRegexp = null;
        },

        toString : function () {
            return '[Route pattern:"'+ this._pattern +'", numListeners:'+ this.matched.getNumListeners() +']';
        }

    };



    // Pattern Lexer ------
    //=====================

    Crossroads.prototype.patternLexer = (function () {

        var
            //match chars that should be escaped on string regexp
            ESCAPE_CHARS_REGEXP = /[\\.+*?\^$\[\](){}\/'#]/g,

            //trailing slashes (begin/end of string)
            LOOSE_SLASHES_REGEXP = /^\/|\/$/g,
            LEGACY_SLASHES_REGEXP = /\/$/g,

            //params - everything between `{ }` or `: :`
            PARAMS_REGEXP = /(?:\{|:)([^}:]+)(?:\}|:)/g,

            //used to save params during compile (avoid escaping things that
            //shouldn't be escaped).
            TOKENS = {
                'OS' : {
                    //optional slashes
                    //slash between `::` or `}:` or `\w:` or `:{?` or `}{?` or `\w{?`
                    rgx : /([:}]|\w(?=\/))\/?(:|(?:\{\?))/g,
                    save : '$1{{id}}$2',
                    res : '\\/?'
                },
                'RS' : {
                    //required slashes
                    //used to insert slash between `:{` and `}{`
                    rgx : /([:}])\/?(\{)/g,
                    save : '$1{{id}}$2',
                    res : '\\/'
                },
                'RQ' : {
                    //required query string - everything in between `{? }`
                    rgx : /\{\?([^}]+)\}/g,
                    //everything from `?` till `#` or end of string
                    res : '\\?([^#]+)'
                },
                'OQ' : {
                    //optional query string - everything in between `:? :`
                    rgx : /:\?([^:]+):/g,
                    //everything from `?` till `#` or end of string
                    res : '(?:\\?([^#]*))?'
                },
                'OR' : {
                    //optional rest - everything in between `: *:`
                    rgx : /:([^:]+)\*:/g,
                    res : '(.*)?' // optional group to avoid passing empty string as captured
                },
                'RR' : {
                    //rest param - everything in between `{ *}`
                    rgx : /\{([^}]+)\*\}/g,
                    res : '(.+)'
                },
                // required/optional params should come after rest segments
                'RP' : {
                    //required params - everything between `{ }`
                    rgx : /\{([^}]+)\}/g,
                    res : '([^\\/?]+)'
                },
                'OP' : {
                    //optional params - everything between `: :`
                    rgx : /:([^:]+):/g,
                    res : '([^\\/?]+)?\/?'
                }
            },

            LOOSE_SLASH = 1,
            STRICT_SLASH = 2,
            LEGACY_SLASH = 3,

            _slashMode = LOOSE_SLASH;


        function precompileTokens(){
            var key, cur;
            for (key in TOKENS) {
                if (TOKENS.hasOwnProperty(key)) {
                    cur = TOKENS[key];
                    cur.id = '__CR_'+ key +'__';
                    cur.save = ('save' in cur)? cur.save.replace('{{id}}', cur.id) : cur.id;
                    cur.rRestore = new RegExp(cur.id, 'g');
                }
            }
        }
        precompileTokens();


        function captureVals(regex, pattern) {
            var vals = [], match;
            // very important to reset lastIndex since RegExp can have "g" flag
            // and multiple runs might affect the result, specially if matching
            // same string multiple times on IE 7-8
            regex.lastIndex = 0;
            while (match = regex.exec(pattern)) {
                vals.push(match[1]);
            }
            return vals;
        }

        function getParamIds(pattern) {
            return captureVals(PARAMS_REGEXP, pattern);
        }

        function getOptionalParamsIds(pattern) {
            return captureVals(TOKENS.OP.rgx, pattern);
        }

        function compilePattern(pattern, ignoreCase) {
            pattern = pattern || '';

            if(pattern){
                if (_slashMode === LOOSE_SLASH) {
                    pattern = pattern.replace(LOOSE_SLASHES_REGEXP, '');
                }
                else if (_slashMode === LEGACY_SLASH) {
                    pattern = pattern.replace(LEGACY_SLASHES_REGEXP, '');
                }

                //save tokens
                pattern = replaceTokens(pattern, 'rgx', 'save');
                //regexp escape
                pattern = pattern.replace(ESCAPE_CHARS_REGEXP, '\\$&');
                //restore tokens
                pattern = replaceTokens(pattern, 'rRestore', 'res');

                if (_slashMode === LOOSE_SLASH) {
                    pattern = '\\/?'+ pattern;
                }
            }

            if (_slashMode !== STRICT_SLASH) {
                //single slash is treated as empty and end slash is optional
                pattern += '\\/?';
            }
            return new RegExp('^'+ pattern + '$', ignoreCase? 'i' : '');
        }

        function replaceTokens(pattern, regexpName, replaceName) {
            var cur, key;
            for (key in TOKENS) {
                if (TOKENS.hasOwnProperty(key)) {
                    cur = TOKENS[key];
                    pattern = pattern.replace(cur[regexpName], cur[replaceName]);
                }
            }
            return pattern;
        }

        function getParamValues(request, regexp, shouldTypecast) {
            var vals = regexp.exec(request);
            if (vals) {
                vals.shift();
                if (shouldTypecast) {
                    vals = typecastArrayValues(vals);
                }
            }
            return vals;
        }

        function interpolate(pattern, replacements) {
            // default to an empty object because pattern might have just
            // optional arguments
            replacements = replacements || {};
            if (typeof pattern !== 'string') {
                throw new Error('Route pattern should be a string.');
            }

            var replaceFn = function(match, prop){
                    var val;
                    prop = (prop.substr(0, 1) === '?')? prop.substr(1) : prop;
                    if (replacements[prop] != null) {
                        if (typeof replacements[prop] === 'object') {
                            var queryParts = [], rep;
                            for(var key in replacements[prop]) {
                                rep = replacements[prop][key];
                                if (isArray(rep)) {
                                    for (var k in rep) {
                                        if ( key.slice(-2) == '[]' ) {
                                            queryParts.push(encodeURI(key.slice(0, -2)) + '[]=' + encodeURI(rep[k]));
                                        } else {
                                            queryParts.push(encodeURI(key + '=' + rep[k]));
                                        }
                                    }
                                }
                                else {
                                    queryParts.push(encodeURI(key + '=' + rep));
                                }
                            }
                            val = '?' + queryParts.join('&');
                        } else {
                            // make sure value is a string see #gh-54
                            val = String(replacements[prop]);
                        }

                        if (match.indexOf('*') === -1 && val.indexOf('/') !== -1) {
                            throw new Error('Invalid value "'+ val +'" for segment "'+ match +'".');
                        }
                    }
                    else if (match.indexOf('{') !== -1) {
                        throw new Error('The segment '+ match +' is required.');
                    }
                    else {
                        val = '';
                    }
                    return val;
                };

            if (! TOKENS.OS.trail) {
                TOKENS.OS.trail = new RegExp('(?:'+ TOKENS.OS.id +')+$');
            }

            return pattern
                        .replace(TOKENS.OS.rgx, TOKENS.OS.save)
                        .replace(PARAMS_REGEXP, replaceFn)
                        .replace(TOKENS.OS.trail, '') // remove trailing
                        .replace(TOKENS.OS.rRestore, '/'); // add slash between segments
        }

        //API
        return {
            strict : function(){
                _slashMode = STRICT_SLASH;
            },
            loose : function(){
                _slashMode = LOOSE_SLASH;
            },
            legacy : function(){
                _slashMode = LEGACY_SLASH;
            },
            getParamIds : getParamIds,
            getOptionalParamsIds : getOptionalParamsIds,
            getParamValues : getParamValues,
            compilePattern : compilePattern,
            interpolate : interpolate
        };

    }());


    return crossroads;
};

if (typeof define === 'function' && define.amd) {
    define(['signals'], factory);
} else if (typeof module !== 'undefined' && module.exports) { //Node
    module.exports = factory(require('signals'));
} else {
    /*jshint sub:true */
    window['crossroads'] = factory(window['signals']);
}

}());


},{"signals":3}],2:[function(require,module,exports){
/*!!
 * Hasher <http://github.com/millermedeiros/hasher>
 * @author Miller Medeiros
 * @version 1.2.0 (2013/11/11 03:18 PM)
 * Released under the MIT License
 */

;(function () {
var factory = function(signals){

/*jshint white:false*/
/*global signals:false, window:false*/

/**
 * Hasher
 * @namespace History Manager for rich-media applications.
 * @name hasher
 */
var hasher = (function(window){

    //--------------------------------------------------------------------------------------
    // Private Vars
    //--------------------------------------------------------------------------------------

    var

        // frequency that it will check hash value on IE 6-7 since it doesn't
        // support the hashchange event
        POOL_INTERVAL = 25,

        // local storage for brevity and better compression --------------------------------

        document = window.document,
        history = window.history,
        Signal = signals.Signal,

        // local vars ----------------------------------------------------------------------

        hasher,
        _hash,
        _checkInterval,
        _isActive,
        _frame, //iframe used for legacy IE (6-7)
        _checkHistory,
        _hashValRegexp = /#(.*)$/,
        _baseUrlRegexp = /(\?.*)|(\#.*)/,
        _hashRegexp = /^\#/,

        // sniffing/feature detection -------------------------------------------------------

        //hack based on this: http://webreflection.blogspot.com/2009/01/32-bytes-to-know-if-your-browser-is-ie.html
        _isIE = (!+"\v1"),
        // hashchange is supported by FF3.6+, IE8+, Chrome 5+, Safari 5+ but
        // feature detection fails on IE compatibility mode, so we need to
        // check documentMode
        _isHashChangeSupported = ('onhashchange' in window) && document.documentMode !== 7,
        //check if is IE6-7 since hash change is only supported on IE8+ and
        //changing hash value on IE6-7 doesn't generate history record.
        _isLegacyIE = _isIE && !_isHashChangeSupported,
        _isLocal = (location.protocol === 'file:');


    //--------------------------------------------------------------------------------------
    // Private Methods
    //--------------------------------------------------------------------------------------

    function _escapeRegExp(str){
        return String(str || '').replace(/\W/g, "\\$&");
    }

    function _trimHash(hash){
        if (!hash) return '';
        var regexp = new RegExp('^' + _escapeRegExp(hasher.prependHash) + '|' + _escapeRegExp(hasher.appendHash) + '$', 'g');
        return hash.replace(regexp, '');
    }

    function _getWindowHash(){
        //parsed full URL instead of getting window.location.hash because Firefox decode hash value (and all the other browsers don't)
        //also because of IE8 bug with hash query in local file [issue #6]
        var result = _hashValRegexp.exec( hasher.getURL() );
        var path = (result && result[1]) || '';
        try {
          return hasher.raw? path : decodeURIComponent(path);
        } catch (e) {
          // in case user did not set `hasher.raw` and decodeURIComponent
          // throws an error (see #57)
          return path;
        }
    }

    function _getFrameHash(){
        return (_frame)? _frame.contentWindow.frameHash : null;
    }

    function _createFrame(){
        _frame = document.createElement('iframe');
        _frame.src = 'about:blank';
        _frame.style.display = 'none';
        document.body.appendChild(_frame);
    }

    function _updateFrame(){
        if(_frame && _hash !== _getFrameHash()){
            var frameDoc = _frame.contentWindow.document;
            frameDoc.open();
            //update iframe content to force new history record.
            //based on Really Simple History, SWFAddress and YUI.history.
            frameDoc.write('<html><head><title>' + document.title + '</title><script type="text/javascript">var frameHash="' + _hash + '";</script></head><body>&nbsp;</body></html>');
            frameDoc.close();
        }
    }

    function _registerChange(newHash, isReplace){
        if(_hash !== newHash){
            var oldHash = _hash;
            _hash = newHash; //should come before event dispatch to make sure user can get proper value inside event handler
            if(_isLegacyIE){
                if(!isReplace){
                    _updateFrame();
                } else {
                    _frame.contentWindow.frameHash = newHash;
                }
            }
            hasher.changed.dispatch(_trimHash(newHash), _trimHash(oldHash));
        }
    }

    if (_isLegacyIE) {
        /**
         * @private
         */
        _checkHistory = function(){
            var windowHash = _getWindowHash(),
                frameHash = _getFrameHash();
            if(frameHash !== _hash && frameHash !== windowHash){
                //detect changes made pressing browser history buttons.
                //Workaround since history.back() and history.forward() doesn't
                //update hash value on IE6/7 but updates content of the iframe.
                //needs to trim hash since value stored already have
                //prependHash + appendHash for fast check.
                hasher.setHash(_trimHash(frameHash));
            } else if (windowHash !== _hash){
                //detect if hash changed (manually or using setHash)
                _registerChange(windowHash);
            }
        };
    } else {
        /**
         * @private
         */
        _checkHistory = function(){
            var windowHash = _getWindowHash();
            if(windowHash !== _hash){
                _registerChange(windowHash);
            }
        };
    }

    function _addListener(elm, eType, fn){
        if(elm.addEventListener){
            elm.addEventListener(eType, fn, false);
        } else if (elm.attachEvent){
            elm.attachEvent('on' + eType, fn);
        }
    }

    function _removeListener(elm, eType, fn){
        if(elm.removeEventListener){
            elm.removeEventListener(eType, fn, false);
        } else if (elm.detachEvent){
            elm.detachEvent('on' + eType, fn);
        }
    }

    function _makePath(paths){
        paths = Array.prototype.slice.call(arguments);

        var path = paths.join(hasher.separator);
        path = path? hasher.prependHash + path.replace(_hashRegexp, '') + hasher.appendHash : path;
        return path;
    }

    function _encodePath(path){
        //used encodeURI instead of encodeURIComponent to preserve '?', '/',
        //'#'. Fixes Safari bug [issue #8]
        path = encodeURI(path);
        if(_isIE && _isLocal){
            //fix IE8 local file bug [issue #6]
            path = path.replace(/\?/, '%3F');
        }
        return path;
    }

    //--------------------------------------------------------------------------------------
    // Public (API)
    //--------------------------------------------------------------------------------------

    hasher = /** @lends hasher */ {

        /**
         * hasher Version Number
         * @type string
         * @constant
         */
        VERSION : '1.2.0',

        /**
         * Boolean deciding if hasher encodes/decodes the hash or not.
         * <ul>
         * <li>default value: false;</li>
         * </ul>
         * @type boolean
         */
        raw : false,

        /**
         * String that should always be added to the end of Hash value.
         * <ul>
         * <li>default value: '';</li>
         * <li>will be automatically removed from `hasher.getHash()`</li>
         * <li>avoid conflicts with elements that contain ID equal to hash value;</li>
         * </ul>
         * @type string
         */
        appendHash : '',

        /**
         * String that should always be added to the beginning of Hash value.
         * <ul>
         * <li>default value: '/';</li>
         * <li>will be automatically removed from `hasher.getHash()`</li>
         * <li>avoid conflicts with elements that contain ID equal to hash value;</li>
         * </ul>
         * @type string
         */
        prependHash : '/',

        /**
         * String used to split hash paths; used by `hasher.getHashAsArray()` to split paths.
         * <ul>
         * <li>default value: '/';</li>
         * </ul>
         * @type string
         */
        separator : '/',

        /**
         * Signal dispatched when hash value changes.
         * - pass current hash as 1st parameter to listeners and previous hash value as 2nd parameter.
         * @type signals.Signal
         */
        changed : new Signal(),

        /**
         * Signal dispatched when hasher is stopped.
         * -  pass current hash as first parameter to listeners
         * @type signals.Signal
         */
        stopped : new Signal(),

        /**
         * Signal dispatched when hasher is initialized.
         * - pass current hash as first parameter to listeners.
         * @type signals.Signal
         */
        initialized : new Signal(),

        /**
         * Start listening/dispatching changes in the hash/history.
         * <ul>
         *   <li>hasher won't dispatch CHANGE events by manually typing a new value or pressing the back/forward buttons before calling this method.</li>
         * </ul>
         */
        init : function(){
            if(_isActive) return;

            _hash = _getWindowHash();

            //thought about branching/overloading hasher.init() to avoid checking multiple times but
            //don't think worth doing it since it probably won't be called multiple times.
            if(_isHashChangeSupported){
                _addListener(window, 'hashchange', _checkHistory);
            }else {
                if(_isLegacyIE){
                    if(! _frame){
                        _createFrame();
                    }
                    _updateFrame();
                }
                _checkInterval = setInterval(_checkHistory, POOL_INTERVAL);
            }

            _isActive = true;
            hasher.initialized.dispatch(_trimHash(_hash));
        },

        /**
         * Stop listening/dispatching changes in the hash/history.
         * <ul>
         *   <li>hasher won't dispatch CHANGE events by manually typing a new value or pressing the back/forward buttons after calling this method, unless you call hasher.init() again.</li>
         *   <li>hasher will still dispatch changes made programatically by calling hasher.setHash();</li>
         * </ul>
         */
        stop : function(){
            if(! _isActive) return;

            if(_isHashChangeSupported){
                _removeListener(window, 'hashchange', _checkHistory);
            }else{
                clearInterval(_checkInterval);
                _checkInterval = null;
            }

            _isActive = false;
            hasher.stopped.dispatch(_trimHash(_hash));
        },

        /**
         * @return {boolean}    If hasher is listening to changes on the browser history and/or hash value.
         */
        isActive : function(){
            return _isActive;
        },

        /**
         * @return {string} Full URL.
         */
        getURL : function(){
            return window.location.href;
        },

        /**
         * @return {string} Retrieve URL without query string and hash.
         */
        getBaseURL : function(){
            return hasher.getURL().replace(_baseUrlRegexp, ''); //removes everything after '?' and/or '#'
        },

        /**
         * Set Hash value, generating a new history record.
         * @param {...string} path    Hash value without '#'. Hasher will join
         * path segments using `hasher.separator` and prepend/append hash value
         * with `hasher.appendHash` and `hasher.prependHash`
         * @example hasher.setHash('lorem', 'ipsum', 'dolor') -> '#/lorem/ipsum/dolor'
         */
        setHash : function(path){
            path = _makePath.apply(null, arguments);
            if(path !== _hash){
                // we should store raw value
                _registerChange(path);
                if (path === _hash) {
                    // we check if path is still === _hash to avoid error in
                    // case of multiple consecutive redirects [issue #39]
                    if (! hasher.raw) {
                        path = _encodePath(path);
                    }
                    window.location.hash = '#' + path;
                }
            }
        },

        /**
         * Set Hash value without keeping previous hash on the history record.
         * Similar to calling `window.location.replace("#/hash")` but will also work on IE6-7.
         * @param {...string} path    Hash value without '#'. Hasher will join
         * path segments using `hasher.separator` and prepend/append hash value
         * with `hasher.appendHash` and `hasher.prependHash`
         * @example hasher.replaceHash('lorem', 'ipsum', 'dolor') -> '#/lorem/ipsum/dolor'
         */
        replaceHash : function(path){
            path = _makePath.apply(null, arguments);
            if(path !== _hash){
                // we should store raw value
                _registerChange(path, true);
                if (path === _hash) {
                    // we check if path is still === _hash to avoid error in
                    // case of multiple consecutive redirects [issue #39]
                    if (! hasher.raw) {
                        path = _encodePath(path);
                    }
                    window.location.replace('#' + path);
                }
            }
        },

        /**
         * @return {string} Hash value without '#', `hasher.appendHash` and `hasher.prependHash`.
         */
        getHash : function(){
            //didn't used actual value of the `window.location.hash` to avoid breaking the application in case `window.location.hash` isn't available and also because value should always be synched.
            return _trimHash(_hash);
        },

        /**
         * @return {Array.<string>} Hash value split into an Array.
         */
        getHashAsArray : function(){
            return hasher.getHash().split(hasher.separator);
        },

        /**
         * Removes all event listeners, stops hasher and destroy hasher object.
         * - IMPORTANT: hasher won't work after calling this method, hasher Object will be deleted.
         */
        dispose : function(){
            hasher.stop();
            hasher.initialized.dispose();
            hasher.stopped.dispose();
            hasher.changed.dispose();
            _frame = hasher = window.hasher = null;
        },

        /**
         * @return {string} A string representation of the object.
         */
        toString : function(){
            return '[hasher version="'+ hasher.VERSION +'" hash="'+ hasher.getHash() +'"]';
        }

    };

    hasher.initialized.memorize = true; //see #33

    return hasher;

}(window));


    return hasher;
};

if (typeof define === 'function' && define.amd) {
    define(['signals'], factory);
} else if (typeof exports === 'object') {
    module.exports = factory(require('signals'));
} else {
    /*jshint sub:true */
    window['hasher'] = factory(window['signals']);
}

}());

},{"signals":3}],3:[function(require,module,exports){
/*jslint onevar:true, undef:true, newcap:true, regexp:true, bitwise:true, maxerr:50, indent:4, white:false, nomen:false, plusplus:false */
/*global define:false, require:false, exports:false, module:false, signals:false */

/** @license
 * JS Signals <http://millermedeiros.github.com/js-signals/>
 * Released under the MIT license
 * Author: Miller Medeiros
 * Version: 1.0.0 - Build: 268 (2012/11/29 05:48 PM)
 */

(function(global){

    // SignalBinding -------------------------------------------------
    //================================================================

    /**
     * Object that represents a binding between a Signal and a listener function.
     * <br />- <strong>This is an internal constructor and shouldn't be called by regular users.</strong>
     * <br />- inspired by Joa Ebert AS3 SignalBinding and Robert Penner's Slot classes.
     * @author Miller Medeiros
     * @constructor
     * @internal
     * @name SignalBinding
     * @param {Signal} signal Reference to Signal object that listener is currently bound to.
     * @param {Function} listener Handler function bound to the signal.
     * @param {boolean} isOnce If binding should be executed just once.
     * @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
     * @param {Number} [priority] The priority level of the event listener. (default = 0).
     */
    function SignalBinding(signal, listener, isOnce, listenerContext, priority) {

        /**
         * Handler function bound to the signal.
         * @type Function
         * @private
         */
        this._listener = listener;

        /**
         * If binding should be executed just once.
         * @type boolean
         * @private
         */
        this._isOnce = isOnce;

        /**
         * Context on which listener will be executed (object that should represent the `this` variable inside listener function).
         * @memberOf SignalBinding.prototype
         * @name context
         * @type Object|undefined|null
         */
        this.context = listenerContext;

        /**
         * Reference to Signal object that listener is currently bound to.
         * @type Signal
         * @private
         */
        this._signal = signal;

        /**
         * Listener priority
         * @type Number
         * @private
         */
        this._priority = priority || 0;
    }

    SignalBinding.prototype = {

        /**
         * If binding is active and should be executed.
         * @type boolean
         */
        active : true,

        /**
         * Default parameters passed to listener during `Signal.dispatch` and `SignalBinding.execute`. (curried parameters)
         * @type Array|null
         */
        params : null,

        /**
         * Call listener passing arbitrary parameters.
         * <p>If binding was added using `Signal.addOnce()` it will be automatically removed from signal dispatch queue, this method is used internally for the signal dispatch.</p>
         * @param {Array} [paramsArr] Array of parameters that should be passed to the listener
         * @return {*} Value returned by the listener.
         */
        execute : function (paramsArr) {
            var handlerReturn, params;
            if (this.active && !!this._listener) {
                params = this.params? this.params.concat(paramsArr) : paramsArr;
                handlerReturn = this._listener.apply(this.context, params);
                if (this._isOnce) {
                    this.detach();
                }
            }
            return handlerReturn;
        },

        /**
         * Detach binding from signal.
         * - alias to: mySignal.remove(myBinding.getListener());
         * @return {Function|null} Handler function bound to the signal or `null` if binding was previously detached.
         */
        detach : function () {
            return this.isBound()? this._signal.remove(this._listener, this.context) : null;
        },

        /**
         * @return {Boolean} `true` if binding is still bound to the signal and have a listener.
         */
        isBound : function () {
            return (!!this._signal && !!this._listener);
        },

        /**
         * @return {boolean} If SignalBinding will only be executed once.
         */
        isOnce : function () {
            return this._isOnce;
        },

        /**
         * @return {Function} Handler function bound to the signal.
         */
        getListener : function () {
            return this._listener;
        },

        /**
         * @return {Signal} Signal that listener is currently bound to.
         */
        getSignal : function () {
            return this._signal;
        },

        /**
         * Delete instance properties
         * @private
         */
        _destroy : function () {
            delete this._signal;
            delete this._listener;
            delete this.context;
        },

        /**
         * @return {string} String representation of the object.
         */
        toString : function () {
            return '[SignalBinding isOnce:' + this._isOnce +', isBound:'+ this.isBound() +', active:' + this.active + ']';
        }

    };


/*global SignalBinding:false*/

    // Signal --------------------------------------------------------
    //================================================================

    function validateListener(listener, fnName) {
        if (typeof listener !== 'function') {
            throw new Error( 'listener is a required param of {fn}() and should be a Function.'.replace('{fn}', fnName) );
        }
    }

    /**
     * Custom event broadcaster
     * <br />- inspired by Robert Penner's AS3 Signals.
     * @name Signal
     * @author Miller Medeiros
     * @constructor
     */
    function Signal() {
        /**
         * @type Array.<SignalBinding>
         * @private
         */
        this._bindings = [];
        this._prevParams = null;

        // enforce dispatch to aways work on same context (#47)
        var self = this;
        this.dispatch = function(){
            Signal.prototype.dispatch.apply(self, arguments);
        };
    }

    Signal.prototype = {

        /**
         * Signals Version Number
         * @type String
         * @const
         */
        VERSION : '1.0.0',

        /**
         * If Signal should keep record of previously dispatched parameters and
         * automatically execute listener during `add()`/`addOnce()` if Signal was
         * already dispatched before.
         * @type boolean
         */
        memorize : false,

        /**
         * @type boolean
         * @private
         */
        _shouldPropagate : true,

        /**
         * If Signal is active and should broadcast events.
         * <p><strong>IMPORTANT:</strong> Setting this property during a dispatch will only affect the next dispatch, if you want to stop the propagation of a signal use `halt()` instead.</p>
         * @type boolean
         */
        active : true,

        /**
         * @param {Function} listener
         * @param {boolean} isOnce
         * @param {Object} [listenerContext]
         * @param {Number} [priority]
         * @return {SignalBinding}
         * @private
         */
        _registerListener : function (listener, isOnce, listenerContext, priority) {

            var prevIndex = this._indexOfListener(listener, listenerContext),
                binding;

            if (prevIndex !== -1) {
                binding = this._bindings[prevIndex];
                if (binding.isOnce() !== isOnce) {
                    throw new Error('You cannot add'+ (isOnce? '' : 'Once') +'() then add'+ (!isOnce? '' : 'Once') +'() the same listener without removing the relationship first.');
                }
            } else {
                binding = new SignalBinding(this, listener, isOnce, listenerContext, priority);
                this._addBinding(binding);
            }

            if(this.memorize && this._prevParams){
                binding.execute(this._prevParams);
            }

            return binding;
        },

        /**
         * @param {SignalBinding} binding
         * @private
         */
        _addBinding : function (binding) {
            //simplified insertion sort
            var n = this._bindings.length;
            do { --n; } while (this._bindings[n] && binding._priority <= this._bindings[n]._priority);
            this._bindings.splice(n + 1, 0, binding);
        },

        /**
         * @param {Function} listener
         * @return {number}
         * @private
         */
        _indexOfListener : function (listener, context) {
            var n = this._bindings.length,
                cur;
            while (n--) {
                cur = this._bindings[n];
                if (cur._listener === listener && cur.context === context) {
                    return n;
                }
            }
            return -1;
        },

        /**
         * Check if listener was attached to Signal.
         * @param {Function} listener
         * @param {Object} [context]
         * @return {boolean} if Signal has the specified listener.
         */
        has : function (listener, context) {
            return this._indexOfListener(listener, context) !== -1;
        },

        /**
         * Add a listener to the signal.
         * @param {Function} listener Signal handler function.
         * @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
         * @param {Number} [priority] The priority level of the event listener. Listeners with higher priority will be executed before listeners with lower priority. Listeners with same priority level will be executed at the same order as they were added. (default = 0)
         * @return {SignalBinding} An Object representing the binding between the Signal and listener.
         */
        add : function (listener, listenerContext, priority) {
            validateListener(listener, 'add');
            return this._registerListener(listener, false, listenerContext, priority);
        },

        /**
         * Add listener to the signal that should be removed after first execution (will be executed only once).
         * @param {Function} listener Signal handler function.
         * @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
         * @param {Number} [priority] The priority level of the event listener. Listeners with higher priority will be executed before listeners with lower priority. Listeners with same priority level will be executed at the same order as they were added. (default = 0)
         * @return {SignalBinding} An Object representing the binding between the Signal and listener.
         */
        addOnce : function (listener, listenerContext, priority) {
            validateListener(listener, 'addOnce');
            return this._registerListener(listener, true, listenerContext, priority);
        },

        /**
         * Remove a single listener from the dispatch queue.
         * @param {Function} listener Handler function that should be removed.
         * @param {Object} [context] Execution context (since you can add the same handler multiple times if executing in a different context).
         * @return {Function} Listener handler function.
         */
        remove : function (listener, context) {
            validateListener(listener, 'remove');

            var i = this._indexOfListener(listener, context);
            if (i !== -1) {
                this._bindings[i]._destroy(); //no reason to a SignalBinding exist if it isn't attached to a signal
                this._bindings.splice(i, 1);
            }
            return listener;
        },

        /**
         * Remove all listeners from the Signal.
         */
        removeAll : function () {
            var n = this._bindings.length;
            while (n--) {
                this._bindings[n]._destroy();
            }
            this._bindings.length = 0;
        },

        /**
         * @return {number} Number of listeners attached to the Signal.
         */
        getNumListeners : function () {
            return this._bindings.length;
        },

        /**
         * Stop propagation of the event, blocking the dispatch to next listeners on the queue.
         * <p><strong>IMPORTANT:</strong> should be called only during signal dispatch, calling it before/after dispatch won't affect signal broadcast.</p>
         * @see Signal.prototype.disable
         */
        halt : function () {
            this._shouldPropagate = false;
        },

        /**
         * Dispatch/Broadcast Signal to all listeners added to the queue.
         * @param {...*} [params] Parameters that should be passed to each handler.
         */
        dispatch : function (params) {
            if (! this.active) {
                return;
            }

            var paramsArr = Array.prototype.slice.call(arguments),
                n = this._bindings.length,
                bindings;

            if (this.memorize) {
                this._prevParams = paramsArr;
            }

            if (! n) {
                //should come after memorize
                return;
            }

            bindings = this._bindings.slice(); //clone array in case add/remove items during dispatch
            this._shouldPropagate = true; //in case `halt` was called before dispatch or during the previous dispatch.

            //execute all callbacks until end of the list or until a callback returns `false` or stops propagation
            //reverse loop since listeners with higher priority will be added at the end of the list
            do { n--; } while (bindings[n] && this._shouldPropagate && bindings[n].execute(paramsArr) !== false);
        },

        /**
         * Forget memorized arguments.
         * @see Signal.memorize
         */
        forget : function(){
            this._prevParams = null;
        },

        /**
         * Remove all bindings from signal and destroy any reference to external objects (destroy Signal object).
         * <p><strong>IMPORTANT:</strong> calling any method on the signal instance after calling dispose will throw errors.</p>
         */
        dispose : function () {
            this.removeAll();
            delete this._bindings;
            delete this._prevParams;
        },

        /**
         * @return {string} String representation of the object.
         */
        toString : function () {
            return '[Signal active:'+ this.active +' numListeners:'+ this.getNumListeners() +']';
        }

    };


    // Namespace -----------------------------------------------------
    //================================================================

    /**
     * Signals namespace
     * @namespace
     * @name signals
     */
    var signals = Signal;

    /**
     * Custom event broadcaster
     * @see Signal
     */
    // alias for backwards compatibility (see #gh-44)
    signals.Signal = Signal;



    //exports to multiple environments
    if(typeof define === 'function' && define.amd){ //AMD
        define(function () { return signals; });
    } else if (typeof module !== 'undefined' && module.exports){ //node
        module.exports = signals;
    } else { //browser
        //use string because of Google closure compiler ADVANCED_MODE
        /*jslint sub:true */
        global['signals'] = signals;
    }

}(this));

},{}],4:[function(require,module,exports){
"use strict";

var _knockout = require("knockout");

var _knockout2 = _interopRequireDefault(_knockout);

var _Router = require("./Router");

var _Router2 = _interopRequireDefault(_Router);

var _navBar = require("./components/nav-bar/nav-bar");

var _navBar2 = _interopRequireDefault(_navBar);

var _home = require("./components/home-page/home");

var _home2 = _interopRequireDefault(_home);

var _newItem = require("./components/new-item/new-item");

var _newItem2 = _interopRequireDefault(_newItem);

var _about = require("./components/about-page/about.html");

var _about2 = _interopRequireDefault(_about);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

_knockout2.default.components.register("nav-bar", _navBar2.default);
_knockout2.default.components.register("home-page", _home2.default);
_knockout2.default.components.register("new-item", _newItem2.default);
_knockout2.default.components.register("about-page", { template: _about2.default });

_knockout2.default.applyBindings({ route: _Router2.default.currentRoute });

},{"./Router":5,"./components/about-page/about.html":6,"./components/home-page/home":8,"./components/nav-bar/nav-bar":10,"./components/new-item/new-item":12,"knockout":15}],5:[function(require,module,exports){
"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _knockout = require("knockout");

var _knockout2 = _interopRequireDefault(_knockout);

var _crossroads = require("crossroads");

var _crossroads2 = _interopRequireDefault(_crossroads);

var _hasher = require("hasher");

var _hasher2 = _interopRequireDefault(_hasher);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Router = (function () {
	function Router(config) {
		var _this = this;

		_classCallCheck(this, Router);

		this.currentRoute = _knockout2.default.observable({});
		_knockout2.default.utils.arrayForEach(config.routes, function (route) {
			_crossroads2.default.addRoute(route.url, function (requestParams) {
				_this.currentRoute(_knockout2.default.utils.extend(requestParams, route.params));
			});
		});

		this.activateCrossroads();
	}

	_createClass(Router, [{
		key: "activateCrossroads",
		value: function activateCrossroads() {
			function parseHash(newHash, oldHash) {
				_crossroads2.default.parse(newHash);
			}

			_crossroads2.default.normalizeFn = _crossroads2.default.NORM_AS_OBJECT;
			_hasher2.default.initialized.add(parseHash);
			_hasher2.default.changed.add(parseHash);
			_hasher2.default.init();
		}
	}]);

	return Router;
})();

exports.default = new Router({
	routes: [{ url: '', params: { page: 'home-page' } }, { url: 'new-item', params: { page: 'new-item' } }, { url: 'about', params: { page: 'about-page' } }]
});

},{"crossroads":1,"hasher":2,"knockout":15}],6:[function(require,module,exports){
module.exports = "<h2>About</h2>\r\n\r\n<p>Sportoholic is an app to track sports and healthy life activities.</p>\r\n";

},{}],7:[function(require,module,exports){
module.exports = "<h2>Home</h2>\r\n\r\n<p data-bind='text: message'></p>\r\n<div class=\"table-responsive\">\r\n\t<table class=\"table\">\r\n\t\t<thead>\r\n\t\t\t<tr>\r\n\t\t\t\t<th>Id</th>\r\n\t\t\t\t<th>Date</th>\r\n\t\t\t\t<th>Description</th>\r\n\t\t\t\t<th>Weight</th>\r\n\t\t\t\t<th>Walking</th>\r\n\t\t\t\t<th>Workout</th>\r\n\t\t\t</tr>\r\n\t\t</thead>\r\n\t\t<tbody data-bind=\"foreach: sportItems\">\r\n\t\t\t<tr>\r\n\t\t\t\t<td data-bind=\"text: id\"></td>\r\n\t\t\t\t<td data-bind=\"text: date\"></td>\r\n\t\t\t\t<td data-bind=\"text: description\"></td>\r\n\t\t\t\t<td data-bind=\"text: weight\"></td>\r\n\t\t\t\t<td data-bind=\"text: walking\"></td>\r\n\t\t\t\t<td data-bind=\"text: workout\"></td>\r\n\t\t\t</tr>\r\n\t\t</tbody>\r\n\t</table>\r\n</div>\r\n\r\n<button data-bind='click: doSomething'>Click me</button>\r\n";

},{}],8:[function(require,module,exports){
"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _knockout = require("knockout");

var _knockout2 = _interopRequireDefault(_knockout);

var _jquery = require("jquery");

var _jquery2 = _interopRequireDefault(_jquery);

var _SportItem = require("../../models/SportItem");

var _SportItem2 = _interopRequireDefault(_SportItem);

var _home = require("./home.html");

var _home2 = _interopRequireDefault(_home);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var HomeViewModel = (function () {
	function HomeViewModel(params) {
		var _this = this;

		_classCallCheck(this, HomeViewModel);

		this.message = _knockout2.default.observable('Welcome to ko-browserify!');
		this.sportItems = _knockout2.default.observableArray();

		_jquery2.default.ajax({
			type: "GET",
			url: "api/sportoholic",
			cache: false,
			dataType: 'json',
			contentType: 'application/json'
		}).done(function (data) {
			_this.sportItems(data.map(function (i) {
				return new _SportItem2.default(i);
			}));
		});
	}

	_createClass(HomeViewModel, [{
		key: "doSomething",
		value: function doSomething() {
			this.message('You invoked doSomething() on the viewmodel.');
		}
	}]);

	return HomeViewModel;
})();

exports.default = {
	viewModel: HomeViewModel,
	template: _home2.default
};

},{"../../models/SportItem":13,"./home.html":7,"jquery":14,"knockout":15}],9:[function(require,module,exports){
module.exports = "<!--\r\n  The navigation UI that is docked to the top of the window. Most of this markup simply\r\n  follows Bootstrap conventions. The only Knockout-specific parts are the data-bind\r\n  attributes on the <li> elements.\r\n-->\r\n<div class=\"navbar navbar-inverse navbar-fixed-top\" role=\"navigation\">\r\n\t<div class=\"container\">\r\n\t\t<div class=\"navbar-header\">\r\n\t\t\t<button type=\"button\" class=\"navbar-toggle\" data-toggle=\"collapse\" data-target=\".navbar-collapse\">\r\n\t\t\t\t<span class=\"sr-only\">Toggle navigation</span>\r\n\t\t\t\t<span class=\"icon-bar\"></span>\r\n\t\t\t\t<span class=\"icon-bar\"></span>\r\n\t\t\t\t<span class=\"icon-bar\"></span>\r\n\t\t\t</button>\r\n\t\t\t<a class=\"navbar-brand\" href=\"#\">Sportoholic</a>\r\n\t\t</div>\r\n\t\t<div class=\"collapse navbar-collapse\">\r\n\r\n\t\t\t<ul class=\"nav navbar-nav\">\r\n\t\t\t\t<li data-bind=\"css: { active: route().page === 'home-page' }\">\r\n\t\t\t\t\t<a href=\"#\">Home</a>\r\n\t\t\t\t</li>\r\n\r\n\t\t\t\t<li data-bind=\"css: { active: route().page === 'new-item' }\">\r\n\t\t\t\t\t<a href=\"#new-item\">New Item</a>\r\n\t\t\t\t</li>\r\n\r\n\t\t\t\t<li data-bind=\"css: { active: route().page === 'about-page' }\">\r\n\t\t\t\t\t<a href=\"#about\">About</a>\r\n\t\t\t\t</li>\r\n\t\t\t</ul>\r\n\r\n\t\t</div>\r\n\t</div>\r\n</div>";

},{}],10:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _knockout = require("knockout");

var _knockout2 = _interopRequireDefault(_knockout);

var _navBar = require("./nav-bar.html");

var _navBar2 = _interopRequireDefault(_navBar);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var NavBarViewModel = function NavBarViewModel(params) {
	_classCallCheck(this, NavBarViewModel);

	this.route = params.route;
};

exports.default = {
	viewModel: NavBarViewModel,
	template: _navBar2.default
};

},{"./nav-bar.html":9,"knockout":15}],11:[function(require,module,exports){
module.exports = "﻿<h2>New Sport Item</h2>\r\n<div id=\"calendar\" data-bind=\"calendar: opts\"></div>\r\n<form class=\"form-horizontal\" role=\"form\" data-bind=\"with: newItem\">\r\n\t<div class=\"form-group\">\r\n\t\t<div class=\"col-sm-12\">\r\n\t\t\t<input type=\"date\" class=\"form-control\" placeholder=\"Date...\" data-bind=\"value: date\" />\r\n\t\t</div>\r\n\t</div>\r\n\t<div class=\"form-group\">\r\n\t\t<div class=\"col-sm-12\">\r\n\t\t\t<input type=\"number\" class=\"form-control\" placeholder=\"Weight...\" data-bind=\"value: weight\" />\r\n\t\t</div>\r\n\t</div>\r\n\t<div class=\"form-group\">\r\n\t\t<div class=\"col-sm-12\">\r\n\t\t\t<input type=\"text\" class=\"form-control\" placeholder=\"Describe your day...\" data-bind=\"value: description\" />\r\n\t\t</div>\r\n\t</div>\r\n\t<div class=\"form-group\">\r\n\t\t<div class=\"col-sm-12\">\r\n\t\t\t<div class=\"checkbox checkbox-inline\">\r\n\t\t\t\t<label>\r\n\t\t\t\t\t<input type=\"checkbox\" data-bind=\"checked: walking\" />\r\n\t\t\t\t\tWalking\r\n\t\t\t\t</label>\r\n\t\t\t</div>\r\n\t\t\t<div class=\"checkbox checkbox-inline\">\r\n\t\t\t\t<label>\r\n\t\t\t\t\t<input type=\"checkbox\" data-bind=\"checked: workout\" />\r\n\t\t\t\t\tWorkout\r\n\t\t\t\t</label>\r\n\t\t\t</div>\r\n\t\t</div>\r\n\t</div>\r\n\t<div class=\"form-group\">\r\n\t\t<div class=\"col-sm-12\">\r\n\t\t\t<button class=\"btn btn-default btn-success\" data-bind=\"click: $parent.save\">Save</button>\r\n\t\t</div>\r\n\t</div>\r\n</form>";

},{}],12:[function(require,module,exports){
"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _knockout = require("knockout");

var _knockout2 = _interopRequireDefault(_knockout);

var _jquery = require("jquery");

var _jquery2 = _interopRequireDefault(_jquery);

var _SportItem = require("../../models/SportItem");

var _SportItem2 = _interopRequireDefault(_SportItem);

var _hasher = require("hasher");

var _hasher2 = _interopRequireDefault(_hasher);

var _koCalendar = require("ko-calendar");

var _koCalendar2 = _interopRequireDefault(_koCalendar);

var _newItem = require("./new-item.html");

var _newItem2 = _interopRequireDefault(_newItem);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var NewItem = (function () {
	function NewItem() {
		_classCallCheck(this, NewItem);

		this.newItem = _knockout2.default.observable(new _SportItem2.default({ Id: 0, Weight: null, Walking: false, Workout: false, Description: null, Date: null }));
		this.opts = {
			value: _knockout2.default.observable(),
			current: new Date(),

			deselectable: true,

			showCalendar: true,
			showToday: true,

			showTime: true,
			showNow: true,
			militaryTime: false,

			min: null,
			max: null,

			autoclose: true,

			strings: {
				months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
				days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
				time: ["AM", "PM"]
			}
		};
	}

	_createClass(NewItem, [{
		key: "save",
		value: function save() {
			_jquery2.default.ajax({
				url: "api/sportoholic",
				type: "POST",
				data: _knockout2.default.toJSON(this),
				dataType: "json",
				contentType: "application/json"
			}).done(function () {
				_hasher2.default.setHash("home-page");
			});
		}
	}]);

	return NewItem;
})();

exports.default = {
	viewModel: NewItem,
	template: _newItem2.default
};

},{"../../models/SportItem":13,"./new-item.html":11,"hasher":2,"jquery":14,"knockout":15,"ko-calendar":16}],13:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _knockout = require("knockout");

var _knockout2 = _interopRequireDefault(_knockout);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var SportItem = function SportItem(params) {
	_classCallCheck(this, SportItem);

	this.id = _knockout2.default.observable(params.Id);
	this.weight = _knockout2.default.observable(params.Weight);
	this.walking = _knockout2.default.observable(params.Walking);
	this.workout = _knockout2.default.observable(params.Workout);
	this.description = _knockout2.default.observable(params.Description);
	this.date = _knockout2.default.observable(params.Date);
};

exports.default = SportItem;

},{"knockout":15}],14:[function(require,module,exports){
(function (global){
; var __browserify_shim_require__=require;(function browserifyShim(module, exports, require, define, browserify_shim__define__module__export__) {
"use strict";

function _typeof(obj) { return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj; }

/*! jQuery v2.1.4 | (c) 2005, 2015 jQuery Foundation, Inc. | jquery.org/license */
!(function (a, b) {
  "object" == (typeof module === "undefined" ? "undefined" : _typeof(module)) && "object" == _typeof(module.exports) ? module.exports = a.document ? b(a, !0) : function (a) {
    if (!a.document) throw new Error("jQuery requires a window with a document");return b(a);
  } : b(a);
})("undefined" != typeof window ? window : undefined, function (a, b) {
  var c = [],
      d = c.slice,
      e = c.concat,
      f = c.push,
      g = c.indexOf,
      h = {},
      i = h.toString,
      j = h.hasOwnProperty,
      k = {},
      l = a.document,
      m = "2.1.4",
      n = function n(a, b) {
    return new n.fn.init(a, b);
  },
      o = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,
      p = /^-ms-/,
      q = /-([\da-z])/gi,
      r = function r(a, b) {
    return b.toUpperCase();
  };n.fn = n.prototype = { jquery: m, constructor: n, selector: "", length: 0, toArray: function toArray() {
      return d.call(this);
    }, get: function get(a) {
      return null != a ? 0 > a ? this[a + this.length] : this[a] : d.call(this);
    }, pushStack: function pushStack(a) {
      var b = n.merge(this.constructor(), a);return b.prevObject = this, b.context = this.context, b;
    }, each: function each(a, b) {
      return n.each(this, a, b);
    }, map: function map(a) {
      return this.pushStack(n.map(this, function (b, c) {
        return a.call(b, c, b);
      }));
    }, slice: function slice() {
      return this.pushStack(d.apply(this, arguments));
    }, first: function first() {
      return this.eq(0);
    }, last: function last() {
      return this.eq(-1);
    }, eq: function eq(a) {
      var b = this.length,
          c = +a + (0 > a ? b : 0);return this.pushStack(c >= 0 && b > c ? [this[c]] : []);
    }, end: function end() {
      return this.prevObject || this.constructor(null);
    }, push: f, sort: c.sort, splice: c.splice }, n.extend = n.fn.extend = function () {
    var a,
        b,
        c,
        d,
        e,
        f,
        g = arguments[0] || {},
        h = 1,
        i = arguments.length,
        j = !1;for ("boolean" == typeof g && (j = g, g = arguments[h] || {}, h++), "object" == (typeof g === "undefined" ? "undefined" : _typeof(g)) || n.isFunction(g) || (g = {}), h === i && (g = this, h--); i > h; h++) {
      if (null != (a = arguments[h])) for (b in a) {
        c = g[b], d = a[b], g !== d && (j && d && (n.isPlainObject(d) || (e = n.isArray(d))) ? (e ? (e = !1, f = c && n.isArray(c) ? c : []) : f = c && n.isPlainObject(c) ? c : {}, g[b] = n.extend(j, f, d)) : void 0 !== d && (g[b] = d));
      }
    }return g;
  }, n.extend({ expando: "jQuery" + (m + Math.random()).replace(/\D/g, ""), isReady: !0, error: function error(a) {
      throw new Error(a);
    }, noop: function noop() {}, isFunction: function isFunction(a) {
      return "function" === n.type(a);
    }, isArray: Array.isArray, isWindow: function isWindow(a) {
      return null != a && a === a.window;
    }, isNumeric: function isNumeric(a) {
      return !n.isArray(a) && a - parseFloat(a) + 1 >= 0;
    }, isPlainObject: function isPlainObject(a) {
      return "object" !== n.type(a) || a.nodeType || n.isWindow(a) ? !1 : a.constructor && !j.call(a.constructor.prototype, "isPrototypeOf") ? !1 : !0;
    }, isEmptyObject: function isEmptyObject(a) {
      var b;for (b in a) {
        return !1;
      }return !0;
    }, type: function type(a) {
      return null == a ? a + "" : "object" == (typeof a === "undefined" ? "undefined" : _typeof(a)) || "function" == typeof a ? h[i.call(a)] || "object" : typeof a === "undefined" ? "undefined" : _typeof(a);
    }, globalEval: function globalEval(a) {
      var b,
          c = eval;a = n.trim(a), a && (1 === a.indexOf("use strict") ? (b = l.createElement("script"), b.text = a, l.head.appendChild(b).parentNode.removeChild(b)) : c(a));
    }, camelCase: function camelCase(a) {
      return a.replace(p, "ms-").replace(q, r);
    }, nodeName: function nodeName(a, b) {
      return a.nodeName && a.nodeName.toLowerCase() === b.toLowerCase();
    }, each: function each(a, b, c) {
      var d,
          e = 0,
          f = a.length,
          g = s(a);if (c) {
        if (g) {
          for (; f > e; e++) {
            if ((d = b.apply(a[e], c), d === !1)) break;
          }
        } else for (e in a) {
          if ((d = b.apply(a[e], c), d === !1)) break;
        }
      } else if (g) {
        for (; f > e; e++) {
          if ((d = b.call(a[e], e, a[e]), d === !1)) break;
        }
      } else for (e in a) {
        if ((d = b.call(a[e], e, a[e]), d === !1)) break;
      }return a;
    }, trim: function trim(a) {
      return null == a ? "" : (a + "").replace(o, "");
    }, makeArray: function makeArray(a, b) {
      var c = b || [];return null != a && (s(Object(a)) ? n.merge(c, "string" == typeof a ? [a] : a) : f.call(c, a)), c;
    }, inArray: function inArray(a, b, c) {
      return null == b ? -1 : g.call(b, a, c);
    }, merge: function merge(a, b) {
      for (var c = +b.length, d = 0, e = a.length; c > d; d++) {
        a[e++] = b[d];
      }return a.length = e, a;
    }, grep: function grep(a, b, c) {
      for (var d, e = [], f = 0, g = a.length, h = !c; g > f; f++) {
        d = !b(a[f], f), d !== h && e.push(a[f]);
      }return e;
    }, map: function map(a, b, c) {
      var d,
          f = 0,
          g = a.length,
          h = s(a),
          i = [];if (h) for (; g > f; f++) {
        d = b(a[f], f, c), null != d && i.push(d);
      } else for (f in a) {
        d = b(a[f], f, c), null != d && i.push(d);
      }return e.apply([], i);
    }, guid: 1, proxy: function proxy(a, b) {
      var c, e, f;return "string" == typeof b && (c = a[b], b = a, a = c), n.isFunction(a) ? (e = d.call(arguments, 2), f = function () {
        return a.apply(b || this, e.concat(d.call(arguments)));
      }, f.guid = a.guid = a.guid || n.guid++, f) : void 0;
    }, now: Date.now, support: k }), n.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function (a, b) {
    h["[object " + b + "]"] = b.toLowerCase();
  });function s(a) {
    var b = "length" in a && a.length,
        c = n.type(a);return "function" === c || n.isWindow(a) ? !1 : 1 === a.nodeType && b ? !0 : "array" === c || 0 === b || "number" == typeof b && b > 0 && b - 1 in a;
  }var t = (function (a) {
    var b,
        c,
        d,
        e,
        f,
        g,
        h,
        i,
        j,
        k,
        l,
        m,
        n,
        o,
        p,
        q,
        r,
        s,
        t,
        u = "sizzle" + 1 * new Date(),
        v = a.document,
        w = 0,
        x = 0,
        y = ha(),
        z = ha(),
        A = ha(),
        B = function B(a, b) {
      return a === b && (l = !0), 0;
    },
        C = 1 << 31,
        D = ({}).hasOwnProperty,
        E = [],
        F = E.pop,
        G = E.push,
        H = E.push,
        I = E.slice,
        J = function J(a, b) {
      for (var c = 0, d = a.length; d > c; c++) {
        if (a[c] === b) return c;
      }return -1;
    },
        K = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",
        L = "[\\x20\\t\\r\\n\\f]",
        M = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",
        N = M.replace("w", "w#"),
        O = "\\[" + L + "*(" + M + ")(?:" + L + "*([*^$|!~]?=)" + L + "*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + N + "))|)" + L + "*\\]",
        P = ":(" + M + ")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|" + O + ")*)|.*)\\)|)",
        Q = new RegExp(L + "+", "g"),
        R = new RegExp("^" + L + "+|((?:^|[^\\\\])(?:\\\\.)*)" + L + "+$", "g"),
        S = new RegExp("^" + L + "*," + L + "*"),
        T = new RegExp("^" + L + "*([>+~]|" + L + ")" + L + "*"),
        U = new RegExp("=" + L + "*([^\\]'\"]*?)" + L + "*\\]", "g"),
        V = new RegExp(P),
        W = new RegExp("^" + N + "$"),
        X = { ID: new RegExp("^#(" + M + ")"), CLASS: new RegExp("^\\.(" + M + ")"), TAG: new RegExp("^(" + M.replace("w", "w*") + ")"), ATTR: new RegExp("^" + O), PSEUDO: new RegExp("^" + P), CHILD: new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + L + "*(even|odd|(([+-]|)(\\d*)n|)" + L + "*(?:([+-]|)" + L + "*(\\d+)|))" + L + "*\\)|)", "i"), bool: new RegExp("^(?:" + K + ")$", "i"), needsContext: new RegExp("^" + L + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" + L + "*((?:-\\d)?\\d*)" + L + "*\\)|)(?=[^-]|$)", "i") },
        Y = /^(?:input|select|textarea|button)$/i,
        Z = /^h\d$/i,
        $ = /^[^{]+\{\s*\[native \w/,
        _ = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,
        aa = /[+~]/,
        ba = /'|\\/g,
        ca = new RegExp("\\\\([\\da-f]{1,6}" + L + "?|(" + L + ")|.)", "ig"),
        da = function da(a, b, c) {
      var d = "0x" + b - 65536;return d !== d || c ? b : 0 > d ? String.fromCharCode(d + 65536) : String.fromCharCode(d >> 10 | 55296, 1023 & d | 56320);
    },
        ea = function ea() {
      m();
    };try {
      H.apply(E = I.call(v.childNodes), v.childNodes), E[v.childNodes.length].nodeType;
    } catch (fa) {
      H = { apply: E.length ? function (a, b) {
          G.apply(a, I.call(b));
        } : function (a, b) {
          var c = a.length,
              d = 0;while (a[c++] = b[d++]) {}a.length = c - 1;
        } };
    }function ga(a, b, d, e) {
      var f, h, j, k, l, o, r, s, w, x;if (((b ? b.ownerDocument || b : v) !== n && m(b), b = b || n, d = d || [], k = b.nodeType, "string" != typeof a || !a || 1 !== k && 9 !== k && 11 !== k)) return d;if (!e && p) {
        if (11 !== k && (f = _.exec(a))) if (j = f[1]) {
          if (9 === k) {
            if ((h = b.getElementById(j), !h || !h.parentNode)) return d;if (h.id === j) return d.push(h), d;
          } else if (b.ownerDocument && (h = b.ownerDocument.getElementById(j)) && t(b, h) && h.id === j) return d.push(h), d;
        } else {
          if (f[2]) return H.apply(d, b.getElementsByTagName(a)), d;if ((j = f[3]) && c.getElementsByClassName) return H.apply(d, b.getElementsByClassName(j)), d;
        }if (c.qsa && (!q || !q.test(a))) {
          if ((s = r = u, w = b, x = 1 !== k && a, 1 === k && "object" !== b.nodeName.toLowerCase())) {
            o = g(a), (r = b.getAttribute("id")) ? s = r.replace(ba, "\\$&") : b.setAttribute("id", s), s = "[id='" + s + "'] ", l = o.length;while (l--) {
              o[l] = s + ra(o[l]);
            }w = aa.test(a) && pa(b.parentNode) || b, x = o.join(",");
          }if (x) try {
            return H.apply(d, w.querySelectorAll(x)), d;
          } catch (y) {} finally {
            r || b.removeAttribute("id");
          }
        }
      }return i(a.replace(R, "$1"), b, d, e);
    }function ha() {
      var a = [];function b(c, e) {
        return a.push(c + " ") > d.cacheLength && delete b[a.shift()], b[c + " "] = e;
      }return b;
    }function ia(a) {
      return a[u] = !0, a;
    }function ja(a) {
      var b = n.createElement("div");try {
        return !!a(b);
      } catch (c) {
        return !1;
      } finally {
        b.parentNode && b.parentNode.removeChild(b), b = null;
      }
    }function ka(a, b) {
      var c = a.split("|"),
          e = a.length;while (e--) {
        d.attrHandle[c[e]] = b;
      }
    }function la(a, b) {
      var c = b && a,
          d = c && 1 === a.nodeType && 1 === b.nodeType && (~b.sourceIndex || C) - (~a.sourceIndex || C);if (d) return d;if (c) while (c = c.nextSibling) {
        if (c === b) return -1;
      }return a ? 1 : -1;
    }function ma(a) {
      return function (b) {
        var c = b.nodeName.toLowerCase();return "input" === c && b.type === a;
      };
    }function na(a) {
      return function (b) {
        var c = b.nodeName.toLowerCase();return ("input" === c || "button" === c) && b.type === a;
      };
    }function oa(a) {
      return ia(function (b) {
        return b = +b, ia(function (c, d) {
          var e,
              f = a([], c.length, b),
              g = f.length;while (g--) {
            c[e = f[g]] && (c[e] = !(d[e] = c[e]));
          }
        });
      });
    }function pa(a) {
      return a && "undefined" != typeof a.getElementsByTagName && a;
    }c = ga.support = {}, f = ga.isXML = function (a) {
      var b = a && (a.ownerDocument || a).documentElement;return b ? "HTML" !== b.nodeName : !1;
    }, m = ga.setDocument = function (a) {
      var b,
          e,
          g = a ? a.ownerDocument || a : v;return g !== n && 9 === g.nodeType && g.documentElement ? (n = g, o = g.documentElement, e = g.defaultView, e && e !== e.top && (e.addEventListener ? e.addEventListener("unload", ea, !1) : e.attachEvent && e.attachEvent("onunload", ea)), p = !f(g), c.attributes = ja(function (a) {
        return a.className = "i", !a.getAttribute("className");
      }), c.getElementsByTagName = ja(function (a) {
        return a.appendChild(g.createComment("")), !a.getElementsByTagName("*").length;
      }), c.getElementsByClassName = $.test(g.getElementsByClassName), c.getById = ja(function (a) {
        return o.appendChild(a).id = u, !g.getElementsByName || !g.getElementsByName(u).length;
      }), c.getById ? (d.find.ID = function (a, b) {
        if ("undefined" != typeof b.getElementById && p) {
          var c = b.getElementById(a);return c && c.parentNode ? [c] : [];
        }
      }, d.filter.ID = function (a) {
        var b = a.replace(ca, da);return function (a) {
          return a.getAttribute("id") === b;
        };
      }) : (delete d.find.ID, d.filter.ID = function (a) {
        var b = a.replace(ca, da);return function (a) {
          var c = "undefined" != typeof a.getAttributeNode && a.getAttributeNode("id");return c && c.value === b;
        };
      }), d.find.TAG = c.getElementsByTagName ? function (a, b) {
        return "undefined" != typeof b.getElementsByTagName ? b.getElementsByTagName(a) : c.qsa ? b.querySelectorAll(a) : void 0;
      } : function (a, b) {
        var c,
            d = [],
            e = 0,
            f = b.getElementsByTagName(a);if ("*" === a) {
          while (c = f[e++]) {
            1 === c.nodeType && d.push(c);
          }return d;
        }return f;
      }, d.find.CLASS = c.getElementsByClassName && function (a, b) {
        return p ? b.getElementsByClassName(a) : void 0;
      }, r = [], q = [], (c.qsa = $.test(g.querySelectorAll)) && (ja(function (a) {
        o.appendChild(a).innerHTML = "<a id='" + u + "'></a><select id='" + u + "-\f]' msallowcapture=''><option selected=''></option></select>", a.querySelectorAll("[msallowcapture^='']").length && q.push("[*^$]=" + L + "*(?:''|\"\")"), a.querySelectorAll("[selected]").length || q.push("\\[" + L + "*(?:value|" + K + ")"), a.querySelectorAll("[id~=" + u + "-]").length || q.push("~="), a.querySelectorAll(":checked").length || q.push(":checked"), a.querySelectorAll("a#" + u + "+*").length || q.push(".#.+[+~]");
      }), ja(function (a) {
        var b = g.createElement("input");b.setAttribute("type", "hidden"), a.appendChild(b).setAttribute("name", "D"), a.querySelectorAll("[name=d]").length && q.push("name" + L + "*[*^$|!~]?="), a.querySelectorAll(":enabled").length || q.push(":enabled", ":disabled"), a.querySelectorAll("*,:x"), q.push(",.*:");
      })), (c.matchesSelector = $.test(s = o.matches || o.webkitMatchesSelector || o.mozMatchesSelector || o.oMatchesSelector || o.msMatchesSelector)) && ja(function (a) {
        c.disconnectedMatch = s.call(a, "div"), s.call(a, "[s!='']:x"), r.push("!=", P);
      }), q = q.length && new RegExp(q.join("|")), r = r.length && new RegExp(r.join("|")), b = $.test(o.compareDocumentPosition), t = b || $.test(o.contains) ? function (a, b) {
        var c = 9 === a.nodeType ? a.documentElement : a,
            d = b && b.parentNode;return a === d || !(!d || 1 !== d.nodeType || !(c.contains ? c.contains(d) : a.compareDocumentPosition && 16 & a.compareDocumentPosition(d)));
      } : function (a, b) {
        if (b) while (b = b.parentNode) {
          if (b === a) return !0;
        }return !1;
      }, B = b ? function (a, b) {
        if (a === b) return l = !0, 0;var d = !a.compareDocumentPosition - !b.compareDocumentPosition;return d ? d : (d = (a.ownerDocument || a) === (b.ownerDocument || b) ? a.compareDocumentPosition(b) : 1, 1 & d || !c.sortDetached && b.compareDocumentPosition(a) === d ? a === g || a.ownerDocument === v && t(v, a) ? -1 : b === g || b.ownerDocument === v && t(v, b) ? 1 : k ? J(k, a) - J(k, b) : 0 : 4 & d ? -1 : 1);
      } : function (a, b) {
        if (a === b) return l = !0, 0;var c,
            d = 0,
            e = a.parentNode,
            f = b.parentNode,
            h = [a],
            i = [b];if (!e || !f) return a === g ? -1 : b === g ? 1 : e ? -1 : f ? 1 : k ? J(k, a) - J(k, b) : 0;if (e === f) return la(a, b);c = a;while (c = c.parentNode) {
          h.unshift(c);
        }c = b;while (c = c.parentNode) {
          i.unshift(c);
        }while (h[d] === i[d]) {
          d++;
        }return d ? la(h[d], i[d]) : h[d] === v ? -1 : i[d] === v ? 1 : 0;
      }, g) : n;
    }, ga.matches = function (a, b) {
      return ga(a, null, null, b);
    }, ga.matchesSelector = function (a, b) {
      if (((a.ownerDocument || a) !== n && m(a), b = b.replace(U, "='$1']"), !(!c.matchesSelector || !p || r && r.test(b) || q && q.test(b)))) try {
        var d = s.call(a, b);if (d || c.disconnectedMatch || a.document && 11 !== a.document.nodeType) return d;
      } catch (e) {}return ga(b, n, null, [a]).length > 0;
    }, ga.contains = function (a, b) {
      return (a.ownerDocument || a) !== n && m(a), t(a, b);
    }, ga.attr = function (a, b) {
      (a.ownerDocument || a) !== n && m(a);var e = d.attrHandle[b.toLowerCase()],
          f = e && D.call(d.attrHandle, b.toLowerCase()) ? e(a, b, !p) : void 0;return void 0 !== f ? f : c.attributes || !p ? a.getAttribute(b) : (f = a.getAttributeNode(b)) && f.specified ? f.value : null;
    }, ga.error = function (a) {
      throw new Error("Syntax error, unrecognized expression: " + a);
    }, ga.uniqueSort = function (a) {
      var b,
          d = [],
          e = 0,
          f = 0;if ((l = !c.detectDuplicates, k = !c.sortStable && a.slice(0), a.sort(B), l)) {
        while (b = a[f++]) {
          b === a[f] && (e = d.push(f));
        }while (e--) {
          a.splice(d[e], 1);
        }
      }return k = null, a;
    }, e = ga.getText = function (a) {
      var b,
          c = "",
          d = 0,
          f = a.nodeType;if (f) {
        if (1 === f || 9 === f || 11 === f) {
          if ("string" == typeof a.textContent) return a.textContent;for (a = a.firstChild; a; a = a.nextSibling) {
            c += e(a);
          }
        } else if (3 === f || 4 === f) return a.nodeValue;
      } else while (b = a[d++]) {
        c += e(b);
      }return c;
    }, d = ga.selectors = { cacheLength: 50, createPseudo: ia, match: X, attrHandle: {}, find: {}, relative: { ">": { dir: "parentNode", first: !0 }, " ": { dir: "parentNode" }, "+": { dir: "previousSibling", first: !0 }, "~": { dir: "previousSibling" } }, preFilter: { ATTR: function ATTR(a) {
          return a[1] = a[1].replace(ca, da), a[3] = (a[3] || a[4] || a[5] || "").replace(ca, da), "~=" === a[2] && (a[3] = " " + a[3] + " "), a.slice(0, 4);
        }, CHILD: function CHILD(a) {
          return a[1] = a[1].toLowerCase(), "nth" === a[1].slice(0, 3) ? (a[3] || ga.error(a[0]), a[4] = +(a[4] ? a[5] + (a[6] || 1) : 2 * ("even" === a[3] || "odd" === a[3])), a[5] = +(a[7] + a[8] || "odd" === a[3])) : a[3] && ga.error(a[0]), a;
        }, PSEUDO: function PSEUDO(a) {
          var b,
              c = !a[6] && a[2];return X.CHILD.test(a[0]) ? null : (a[3] ? a[2] = a[4] || a[5] || "" : c && V.test(c) && (b = g(c, !0)) && (b = c.indexOf(")", c.length - b) - c.length) && (a[0] = a[0].slice(0, b), a[2] = c.slice(0, b)), a.slice(0, 3));
        } }, filter: { TAG: function TAG(a) {
          var b = a.replace(ca, da).toLowerCase();return "*" === a ? function () {
            return !0;
          } : function (a) {
            return a.nodeName && a.nodeName.toLowerCase() === b;
          };
        }, CLASS: function CLASS(a) {
          var b = y[a + " "];return b || (b = new RegExp("(^|" + L + ")" + a + "(" + L + "|$)")) && y(a, function (a) {
            return b.test("string" == typeof a.className && a.className || "undefined" != typeof a.getAttribute && a.getAttribute("class") || "");
          });
        }, ATTR: function ATTR(a, b, c) {
          return function (d) {
            var e = ga.attr(d, a);return null == e ? "!=" === b : b ? (e += "", "=" === b ? e === c : "!=" === b ? e !== c : "^=" === b ? c && 0 === e.indexOf(c) : "*=" === b ? c && e.indexOf(c) > -1 : "$=" === b ? c && e.slice(-c.length) === c : "~=" === b ? (" " + e.replace(Q, " ") + " ").indexOf(c) > -1 : "|=" === b ? e === c || e.slice(0, c.length + 1) === c + "-" : !1) : !0;
          };
        }, CHILD: function CHILD(a, b, c, d, e) {
          var f = "nth" !== a.slice(0, 3),
              g = "last" !== a.slice(-4),
              h = "of-type" === b;return 1 === d && 0 === e ? function (a) {
            return !!a.parentNode;
          } : function (b, c, i) {
            var j,
                k,
                l,
                m,
                n,
                o,
                p = f !== g ? "nextSibling" : "previousSibling",
                q = b.parentNode,
                r = h && b.nodeName.toLowerCase(),
                s = !i && !h;if (q) {
              if (f) {
                while (p) {
                  l = b;while (l = l[p]) {
                    if (h ? l.nodeName.toLowerCase() === r : 1 === l.nodeType) return !1;
                  }o = p = "only" === a && !o && "nextSibling";
                }return !0;
              }if ((o = [g ? q.firstChild : q.lastChild], g && s)) {
                k = q[u] || (q[u] = {}), j = k[a] || [], n = j[0] === w && j[1], m = j[0] === w && j[2], l = n && q.childNodes[n];while (l = ++n && l && l[p] || (m = n = 0) || o.pop()) {
                  if (1 === l.nodeType && ++m && l === b) {
                    k[a] = [w, n, m];break;
                  }
                }
              } else if (s && (j = (b[u] || (b[u] = {}))[a]) && j[0] === w) m = j[1];else while (l = ++n && l && l[p] || (m = n = 0) || o.pop()) {
                if ((h ? l.nodeName.toLowerCase() === r : 1 === l.nodeType) && ++m && (s && ((l[u] || (l[u] = {}))[a] = [w, m]), l === b)) break;
              }return m -= e, m === d || m % d === 0 && m / d >= 0;
            }
          };
        }, PSEUDO: function PSEUDO(a, b) {
          var c,
              e = d.pseudos[a] || d.setFilters[a.toLowerCase()] || ga.error("unsupported pseudo: " + a);return e[u] ? e(b) : e.length > 1 ? (c = [a, a, "", b], d.setFilters.hasOwnProperty(a.toLowerCase()) ? ia(function (a, c) {
            var d,
                f = e(a, b),
                g = f.length;while (g--) {
              d = J(a, f[g]), a[d] = !(c[d] = f[g]);
            }
          }) : function (a) {
            return e(a, 0, c);
          }) : e;
        } }, pseudos: { not: ia(function (a) {
          var b = [],
              c = [],
              d = h(a.replace(R, "$1"));return d[u] ? ia(function (a, b, c, e) {
            var f,
                g = d(a, null, e, []),
                h = a.length;while (h--) {
              (f = g[h]) && (a[h] = !(b[h] = f));
            }
          }) : function (a, e, f) {
            return b[0] = a, d(b, null, f, c), b[0] = null, !c.pop();
          };
        }), has: ia(function (a) {
          return function (b) {
            return ga(a, b).length > 0;
          };
        }), contains: ia(function (a) {
          return a = a.replace(ca, da), function (b) {
            return (b.textContent || b.innerText || e(b)).indexOf(a) > -1;
          };
        }), lang: ia(function (a) {
          return W.test(a || "") || ga.error("unsupported lang: " + a), a = a.replace(ca, da).toLowerCase(), function (b) {
            var c;do {
              if (c = p ? b.lang : b.getAttribute("xml:lang") || b.getAttribute("lang")) return c = c.toLowerCase(), c === a || 0 === c.indexOf(a + "-");
            } while ((b = b.parentNode) && 1 === b.nodeType);return !1;
          };
        }), target: function target(b) {
          var c = a.location && a.location.hash;return c && c.slice(1) === b.id;
        }, root: function root(a) {
          return a === o;
        }, focus: function focus(a) {
          return a === n.activeElement && (!n.hasFocus || n.hasFocus()) && !!(a.type || a.href || ~a.tabIndex);
        }, enabled: function enabled(a) {
          return a.disabled === !1;
        }, disabled: function disabled(a) {
          return a.disabled === !0;
        }, checked: function checked(a) {
          var b = a.nodeName.toLowerCase();return "input" === b && !!a.checked || "option" === b && !!a.selected;
        }, selected: function selected(a) {
          return a.parentNode && a.parentNode.selectedIndex, a.selected === !0;
        }, empty: function empty(a) {
          for (a = a.firstChild; a; a = a.nextSibling) {
            if (a.nodeType < 6) return !1;
          }return !0;
        }, parent: function parent(a) {
          return !d.pseudos.empty(a);
        }, header: function header(a) {
          return Z.test(a.nodeName);
        }, input: function input(a) {
          return Y.test(a.nodeName);
        }, button: function button(a) {
          var b = a.nodeName.toLowerCase();return "input" === b && "button" === a.type || "button" === b;
        }, text: function text(a) {
          var b;return "input" === a.nodeName.toLowerCase() && "text" === a.type && (null == (b = a.getAttribute("type")) || "text" === b.toLowerCase());
        }, first: oa(function () {
          return [0];
        }), last: oa(function (a, b) {
          return [b - 1];
        }), eq: oa(function (a, b, c) {
          return [0 > c ? c + b : c];
        }), even: oa(function (a, b) {
          for (var c = 0; b > c; c += 2) {
            a.push(c);
          }return a;
        }), odd: oa(function (a, b) {
          for (var c = 1; b > c; c += 2) {
            a.push(c);
          }return a;
        }), lt: oa(function (a, b, c) {
          for (var d = 0 > c ? c + b : c; --d >= 0;) {
            a.push(d);
          }return a;
        }), gt: oa(function (a, b, c) {
          for (var d = 0 > c ? c + b : c; ++d < b;) {
            a.push(d);
          }return a;
        }) } }, d.pseudos.nth = d.pseudos.eq;for (b in { radio: !0, checkbox: !0, file: !0, password: !0, image: !0 }) {
      d.pseudos[b] = ma(b);
    }for (b in { submit: !0, reset: !0 }) {
      d.pseudos[b] = na(b);
    }function qa() {}qa.prototype = d.filters = d.pseudos, d.setFilters = new qa(), g = ga.tokenize = function (a, b) {
      var c,
          e,
          f,
          g,
          h,
          i,
          j,
          k = z[a + " "];if (k) return b ? 0 : k.slice(0);h = a, i = [], j = d.preFilter;while (h) {
        (!c || (e = S.exec(h))) && (e && (h = h.slice(e[0].length) || h), i.push(f = [])), c = !1, (e = T.exec(h)) && (c = e.shift(), f.push({ value: c, type: e[0].replace(R, " ") }), h = h.slice(c.length));for (g in d.filter) {
          !(e = X[g].exec(h)) || j[g] && !(e = j[g](e)) || (c = e.shift(), f.push({ value: c, type: g, matches: e }), h = h.slice(c.length));
        }if (!c) break;
      }return b ? h.length : h ? ga.error(a) : z(a, i).slice(0);
    };function ra(a) {
      for (var b = 0, c = a.length, d = ""; c > b; b++) {
        d += a[b].value;
      }return d;
    }function sa(a, b, c) {
      var d = b.dir,
          e = c && "parentNode" === d,
          f = x++;return b.first ? function (b, c, f) {
        while (b = b[d]) {
          if (1 === b.nodeType || e) return a(b, c, f);
        }
      } : function (b, c, g) {
        var h,
            i,
            j = [w, f];if (g) {
          while (b = b[d]) {
            if ((1 === b.nodeType || e) && a(b, c, g)) return !0;
          }
        } else while (b = b[d]) {
          if (1 === b.nodeType || e) {
            if ((i = b[u] || (b[u] = {}), (h = i[d]) && h[0] === w && h[1] === f)) return j[2] = h[2];if ((i[d] = j, j[2] = a(b, c, g))) return !0;
          }
        }
      };
    }function ta(a) {
      return a.length > 1 ? function (b, c, d) {
        var e = a.length;while (e--) {
          if (!a[e](b, c, d)) return !1;
        }return !0;
      } : a[0];
    }function ua(a, b, c) {
      for (var d = 0, e = b.length; e > d; d++) {
        ga(a, b[d], c);
      }return c;
    }function va(a, b, c, d, e) {
      for (var f, g = [], h = 0, i = a.length, j = null != b; i > h; h++) {
        (f = a[h]) && (!c || c(f, d, e)) && (g.push(f), j && b.push(h));
      }return g;
    }function wa(a, b, c, d, e, f) {
      return d && !d[u] && (d = wa(d)), e && !e[u] && (e = wa(e, f)), ia(function (f, g, h, i) {
        var j,
            k,
            l,
            m = [],
            n = [],
            o = g.length,
            p = f || ua(b || "*", h.nodeType ? [h] : h, []),
            q = !a || !f && b ? p : va(p, m, a, h, i),
            r = c ? e || (f ? a : o || d) ? [] : g : q;if ((c && c(q, r, h, i), d)) {
          j = va(r, n), d(j, [], h, i), k = j.length;while (k--) {
            (l = j[k]) && (r[n[k]] = !(q[n[k]] = l));
          }
        }if (f) {
          if (e || a) {
            if (e) {
              j = [], k = r.length;while (k--) {
                (l = r[k]) && j.push(q[k] = l);
              }e(null, r = [], j, i);
            }k = r.length;while (k--) {
              (l = r[k]) && (j = e ? J(f, l) : m[k]) > -1 && (f[j] = !(g[j] = l));
            }
          }
        } else r = va(r === g ? r.splice(o, r.length) : r), e ? e(null, g, r, i) : H.apply(g, r);
      });
    }function xa(a) {
      for (var b, c, e, f = a.length, g = d.relative[a[0].type], h = g || d.relative[" "], i = g ? 1 : 0, k = sa(function (a) {
        return a === b;
      }, h, !0), l = sa(function (a) {
        return J(b, a) > -1;
      }, h, !0), m = [function (a, c, d) {
        var e = !g && (d || c !== j) || ((b = c).nodeType ? k(a, c, d) : l(a, c, d));return b = null, e;
      }]; f > i; i++) {
        if (c = d.relative[a[i].type]) m = [sa(ta(m), c)];else {
          if ((c = d.filter[a[i].type].apply(null, a[i].matches), c[u])) {
            for (e = ++i; f > e; e++) {
              if (d.relative[a[e].type]) break;
            }return wa(i > 1 && ta(m), i > 1 && ra(a.slice(0, i - 1).concat({ value: " " === a[i - 2].type ? "*" : "" })).replace(R, "$1"), c, e > i && xa(a.slice(i, e)), f > e && xa(a = a.slice(e)), f > e && ra(a));
          }m.push(c);
        }
      }return ta(m);
    }function ya(a, b) {
      var c = b.length > 0,
          e = a.length > 0,
          f = function f(_f, g, h, i, k) {
        var l,
            m,
            o,
            p = 0,
            q = "0",
            r = _f && [],
            s = [],
            t = j,
            u = _f || e && d.find.TAG("*", k),
            v = w += null == t ? 1 : Math.random() || .1,
            x = u.length;for (k && (j = g !== n && g); q !== x && null != (l = u[q]); q++) {
          if (e && l) {
            m = 0;while (o = a[m++]) {
              if (o(l, g, h)) {
                i.push(l);break;
              }
            }k && (w = v);
          }c && ((l = !o && l) && p--, _f && r.push(l));
        }if ((p += q, c && q !== p)) {
          m = 0;while (o = b[m++]) {
            o(r, s, g, h);
          }if (_f) {
            if (p > 0) while (q--) {
              r[q] || s[q] || (s[q] = F.call(i));
            }s = va(s);
          }H.apply(i, s), k && !_f && s.length > 0 && p + b.length > 1 && ga.uniqueSort(i);
        }return k && (w = v, j = t), r;
      };return c ? ia(f) : f;
    }return h = ga.compile = function (a, b) {
      var c,
          d = [],
          e = [],
          f = A[a + " "];if (!f) {
        b || (b = g(a)), c = b.length;while (c--) {
          f = xa(b[c]), f[u] ? d.push(f) : e.push(f);
        }f = A(a, ya(e, d)), f.selector = a;
      }return f;
    }, i = ga.select = function (a, b, e, f) {
      var i,
          j,
          k,
          l,
          m,
          n = "function" == typeof a && a,
          o = !f && g(a = n.selector || a);if ((e = e || [], 1 === o.length)) {
        if ((j = o[0] = o[0].slice(0), j.length > 2 && "ID" === (k = j[0]).type && c.getById && 9 === b.nodeType && p && d.relative[j[1].type])) {
          if ((b = (d.find.ID(k.matches[0].replace(ca, da), b) || [])[0], !b)) return e;n && (b = b.parentNode), a = a.slice(j.shift().value.length);
        }i = X.needsContext.test(a) ? 0 : j.length;while (i--) {
          if ((k = j[i], d.relative[l = k.type])) break;if ((m = d.find[l]) && (f = m(k.matches[0].replace(ca, da), aa.test(j[0].type) && pa(b.parentNode) || b))) {
            if ((j.splice(i, 1), a = f.length && ra(j), !a)) return H.apply(e, f), e;break;
          }
        }
      }return (n || h(a, o))(f, b, !p, e, aa.test(a) && pa(b.parentNode) || b), e;
    }, c.sortStable = u.split("").sort(B).join("") === u, c.detectDuplicates = !!l, m(), c.sortDetached = ja(function (a) {
      return 1 & a.compareDocumentPosition(n.createElement("div"));
    }), ja(function (a) {
      return a.innerHTML = "<a href='#'></a>", "#" === a.firstChild.getAttribute("href");
    }) || ka("type|href|height|width", function (a, b, c) {
      return c ? void 0 : a.getAttribute(b, "type" === b.toLowerCase() ? 1 : 2);
    }), c.attributes && ja(function (a) {
      return a.innerHTML = "<input/>", a.firstChild.setAttribute("value", ""), "" === a.firstChild.getAttribute("value");
    }) || ka("value", function (a, b, c) {
      return c || "input" !== a.nodeName.toLowerCase() ? void 0 : a.defaultValue;
    }), ja(function (a) {
      return null == a.getAttribute("disabled");
    }) || ka(K, function (a, b, c) {
      var d;return c ? void 0 : a[b] === !0 ? b.toLowerCase() : (d = a.getAttributeNode(b)) && d.specified ? d.value : null;
    }), ga;
  })(a);n.find = t, n.expr = t.selectors, n.expr[":"] = n.expr.pseudos, n.unique = t.uniqueSort, n.text = t.getText, n.isXMLDoc = t.isXML, n.contains = t.contains;var u = n.expr.match.needsContext,
      v = /^<(\w+)\s*\/?>(?:<\/\1>|)$/,
      w = /^.[^:#\[\.,]*$/;function x(a, b, c) {
    if (n.isFunction(b)) return n.grep(a, function (a, d) {
      return !!b.call(a, d, a) !== c;
    });if (b.nodeType) return n.grep(a, function (a) {
      return a === b !== c;
    });if ("string" == typeof b) {
      if (w.test(b)) return n.filter(b, a, c);b = n.filter(b, a);
    }return n.grep(a, function (a) {
      return g.call(b, a) >= 0 !== c;
    });
  }n.filter = function (a, b, c) {
    var d = b[0];return c && (a = ":not(" + a + ")"), 1 === b.length && 1 === d.nodeType ? n.find.matchesSelector(d, a) ? [d] : [] : n.find.matches(a, n.grep(b, function (a) {
      return 1 === a.nodeType;
    }));
  }, n.fn.extend({ find: function find(a) {
      var b,
          c = this.length,
          d = [],
          e = this;if ("string" != typeof a) return this.pushStack(n(a).filter(function () {
        for (b = 0; c > b; b++) {
          if (n.contains(e[b], this)) return !0;
        }
      }));for (b = 0; c > b; b++) {
        n.find(a, e[b], d);
      }return d = this.pushStack(c > 1 ? n.unique(d) : d), d.selector = this.selector ? this.selector + " " + a : a, d;
    }, filter: function filter(a) {
      return this.pushStack(x(this, a || [], !1));
    }, not: function not(a) {
      return this.pushStack(x(this, a || [], !0));
    }, is: function is(a) {
      return !!x(this, "string" == typeof a && u.test(a) ? n(a) : a || [], !1).length;
    } });var y,
      z = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,
      A = n.fn.init = function (a, b) {
    var c, d;if (!a) return this;if ("string" == typeof a) {
      if ((c = "<" === a[0] && ">" === a[a.length - 1] && a.length >= 3 ? [null, a, null] : z.exec(a), !c || !c[1] && b)) return !b || b.jquery ? (b || y).find(a) : this.constructor(b).find(a);if (c[1]) {
        if ((b = b instanceof n ? b[0] : b, n.merge(this, n.parseHTML(c[1], b && b.nodeType ? b.ownerDocument || b : l, !0)), v.test(c[1]) && n.isPlainObject(b))) for (c in b) {
          n.isFunction(this[c]) ? this[c](b[c]) : this.attr(c, b[c]);
        }return this;
      }return d = l.getElementById(c[2]), d && d.parentNode && (this.length = 1, this[0] = d), this.context = l, this.selector = a, this;
    }return a.nodeType ? (this.context = this[0] = a, this.length = 1, this) : n.isFunction(a) ? "undefined" != typeof y.ready ? y.ready(a) : a(n) : (void 0 !== a.selector && (this.selector = a.selector, this.context = a.context), n.makeArray(a, this));
  };A.prototype = n.fn, y = n(l);var B = /^(?:parents|prev(?:Until|All))/,
      C = { children: !0, contents: !0, next: !0, prev: !0 };n.extend({ dir: function dir(a, b, c) {
      var d = [],
          e = void 0 !== c;while ((a = a[b]) && 9 !== a.nodeType) {
        if (1 === a.nodeType) {
          if (e && n(a).is(c)) break;d.push(a);
        }
      }return d;
    }, sibling: function sibling(a, b) {
      for (var c = []; a; a = a.nextSibling) {
        1 === a.nodeType && a !== b && c.push(a);
      }return c;
    } }), n.fn.extend({ has: function has(a) {
      var b = n(a, this),
          c = b.length;return this.filter(function () {
        for (var a = 0; c > a; a++) {
          if (n.contains(this, b[a])) return !0;
        }
      });
    }, closest: function closest(a, b) {
      for (var c, d = 0, e = this.length, f = [], g = u.test(a) || "string" != typeof a ? n(a, b || this.context) : 0; e > d; d++) {
        for (c = this[d]; c && c !== b; c = c.parentNode) {
          if (c.nodeType < 11 && (g ? g.index(c) > -1 : 1 === c.nodeType && n.find.matchesSelector(c, a))) {
            f.push(c);break;
          }
        }
      }return this.pushStack(f.length > 1 ? n.unique(f) : f);
    }, index: function index(a) {
      return a ? "string" == typeof a ? g.call(n(a), this[0]) : g.call(this, a.jquery ? a[0] : a) : this[0] && this[0].parentNode ? this.first().prevAll().length : -1;
    }, add: function add(a, b) {
      return this.pushStack(n.unique(n.merge(this.get(), n(a, b))));
    }, addBack: function addBack(a) {
      return this.add(null == a ? this.prevObject : this.prevObject.filter(a));
    } });function D(a, b) {
    while ((a = a[b]) && 1 !== a.nodeType) {}return a;
  }n.each({ parent: function parent(a) {
      var b = a.parentNode;return b && 11 !== b.nodeType ? b : null;
    }, parents: function parents(a) {
      return n.dir(a, "parentNode");
    }, parentsUntil: function parentsUntil(a, b, c) {
      return n.dir(a, "parentNode", c);
    }, next: function next(a) {
      return D(a, "nextSibling");
    }, prev: function prev(a) {
      return D(a, "previousSibling");
    }, nextAll: function nextAll(a) {
      return n.dir(a, "nextSibling");
    }, prevAll: function prevAll(a) {
      return n.dir(a, "previousSibling");
    }, nextUntil: function nextUntil(a, b, c) {
      return n.dir(a, "nextSibling", c);
    }, prevUntil: function prevUntil(a, b, c) {
      return n.dir(a, "previousSibling", c);
    }, siblings: function siblings(a) {
      return n.sibling((a.parentNode || {}).firstChild, a);
    }, children: function children(a) {
      return n.sibling(a.firstChild);
    }, contents: function contents(a) {
      return a.contentDocument || n.merge([], a.childNodes);
    } }, function (a, b) {
    n.fn[a] = function (c, d) {
      var e = n.map(this, b, c);return "Until" !== a.slice(-5) && (d = c), d && "string" == typeof d && (e = n.filter(d, e)), this.length > 1 && (C[a] || n.unique(e), B.test(a) && e.reverse()), this.pushStack(e);
    };
  });var E = /\S+/g,
      F = {};function G(a) {
    var b = F[a] = {};return n.each(a.match(E) || [], function (a, c) {
      b[c] = !0;
    }), b;
  }n.Callbacks = function (a) {
    a = "string" == typeof a ? F[a] || G(a) : n.extend({}, a);var b,
        c,
        d,
        e,
        f,
        g,
        h = [],
        i = !a.once && [],
        j = function j(l) {
      for (b = a.memory && l, c = !0, g = e || 0, e = 0, f = h.length, d = !0; h && f > g; g++) {
        if (h[g].apply(l[0], l[1]) === !1 && a.stopOnFalse) {
          b = !1;break;
        }
      }d = !1, h && (i ? i.length && j(i.shift()) : b ? h = [] : k.disable());
    },
        k = { add: function add() {
        if (h) {
          var c = h.length;!(function g(b) {
            n.each(b, function (b, c) {
              var d = n.type(c);"function" === d ? a.unique && k.has(c) || h.push(c) : c && c.length && "string" !== d && g(c);
            });
          })(arguments), d ? f = h.length : b && (e = c, j(b));
        }return this;
      }, remove: function remove() {
        return h && n.each(arguments, function (a, b) {
          var c;while ((c = n.inArray(b, h, c)) > -1) {
            h.splice(c, 1), d && (f >= c && f--, g >= c && g--);
          }
        }), this;
      }, has: function has(a) {
        return a ? n.inArray(a, h) > -1 : !(!h || !h.length);
      }, empty: function empty() {
        return h = [], f = 0, this;
      }, disable: function disable() {
        return h = i = b = void 0, this;
      }, disabled: function disabled() {
        return !h;
      }, lock: function lock() {
        return i = void 0, b || k.disable(), this;
      }, locked: function locked() {
        return !i;
      }, fireWith: function fireWith(a, b) {
        return !h || c && !i || (b = b || [], b = [a, b.slice ? b.slice() : b], d ? i.push(b) : j(b)), this;
      }, fire: function fire() {
        return k.fireWith(this, arguments), this;
      }, fired: function fired() {
        return !!c;
      } };return k;
  }, n.extend({ Deferred: function Deferred(a) {
      var b = [["resolve", "done", n.Callbacks("once memory"), "resolved"], ["reject", "fail", n.Callbacks("once memory"), "rejected"], ["notify", "progress", n.Callbacks("memory")]],
          c = "pending",
          d = { state: function state() {
          return c;
        }, always: function always() {
          return e.done(arguments).fail(arguments), this;
        }, then: function then() {
          var a = arguments;return n.Deferred(function (c) {
            n.each(b, function (b, f) {
              var g = n.isFunction(a[b]) && a[b];e[f[1]](function () {
                var a = g && g.apply(this, arguments);a && n.isFunction(a.promise) ? a.promise().done(c.resolve).fail(c.reject).progress(c.notify) : c[f[0] + "With"](this === d ? c.promise() : this, g ? [a] : arguments);
              });
            }), a = null;
          }).promise();
        }, promise: function promise(a) {
          return null != a ? n.extend(a, d) : d;
        } },
          e = {};return d.pipe = d.then, n.each(b, function (a, f) {
        var g = f[2],
            h = f[3];d[f[1]] = g.add, h && g.add(function () {
          c = h;
        }, b[1 ^ a][2].disable, b[2][2].lock), e[f[0]] = function () {
          return e[f[0] + "With"](this === e ? d : this, arguments), this;
        }, e[f[0] + "With"] = g.fireWith;
      }), d.promise(e), a && a.call(e, e), e;
    }, when: function when(a) {
      var b = 0,
          c = d.call(arguments),
          e = c.length,
          f = 1 !== e || a && n.isFunction(a.promise) ? e : 0,
          g = 1 === f ? a : n.Deferred(),
          h = function h(a, b, c) {
        return function (e) {
          b[a] = this, c[a] = arguments.length > 1 ? d.call(arguments) : e, c === i ? g.notifyWith(b, c) : --f || g.resolveWith(b, c);
        };
      },
          i,
          j,
          k;if (e > 1) for (i = new Array(e), j = new Array(e), k = new Array(e); e > b; b++) {
        c[b] && n.isFunction(c[b].promise) ? c[b].promise().done(h(b, k, c)).fail(g.reject).progress(h(b, j, i)) : --f;
      }return f || g.resolveWith(k, c), g.promise();
    } });var H;n.fn.ready = function (a) {
    return n.ready.promise().done(a), this;
  }, n.extend({ isReady: !1, readyWait: 1, holdReady: function holdReady(a) {
      a ? n.readyWait++ : n.ready(!0);
    }, ready: function ready(a) {
      (a === !0 ? --n.readyWait : n.isReady) || (n.isReady = !0, a !== !0 && --n.readyWait > 0 || (H.resolveWith(l, [n]), n.fn.triggerHandler && (n(l).triggerHandler("ready"), n(l).off("ready"))));
    } });function I() {
    l.removeEventListener("DOMContentLoaded", I, !1), a.removeEventListener("load", I, !1), n.ready();
  }n.ready.promise = function (b) {
    return H || (H = n.Deferred(), "complete" === l.readyState ? setTimeout(n.ready) : (l.addEventListener("DOMContentLoaded", I, !1), a.addEventListener("load", I, !1))), H.promise(b);
  }, n.ready.promise();var J = n.access = function (a, b, c, d, e, f, g) {
    var h = 0,
        i = a.length,
        j = null == c;if ("object" === n.type(c)) {
      e = !0;for (h in c) {
        n.access(a, b, h, c[h], !0, f, g);
      }
    } else if (void 0 !== d && (e = !0, n.isFunction(d) || (g = !0), j && (g ? (b.call(a, d), b = null) : (j = b, b = function (a, b, c) {
      return j.call(n(a), c);
    })), b)) for (; i > h; h++) {
      b(a[h], c, g ? d : d.call(a[h], h, b(a[h], c)));
    }return e ? a : j ? b.call(a) : i ? b(a[0], c) : f;
  };n.acceptData = function (a) {
    return 1 === a.nodeType || 9 === a.nodeType || ! +a.nodeType;
  };function K() {
    Object.defineProperty(this.cache = {}, 0, { get: function get() {
        return {};
      } }), this.expando = n.expando + K.uid++;
  }K.uid = 1, K.accepts = n.acceptData, K.prototype = { key: function key(a) {
      if (!K.accepts(a)) return 0;var b = {},
          c = a[this.expando];if (!c) {
        c = K.uid++;try {
          b[this.expando] = { value: c }, Object.defineProperties(a, b);
        } catch (d) {
          b[this.expando] = c, n.extend(a, b);
        }
      }return this.cache[c] || (this.cache[c] = {}), c;
    }, set: function set(a, b, c) {
      var d,
          e = this.key(a),
          f = this.cache[e];if ("string" == typeof b) f[b] = c;else if (n.isEmptyObject(f)) n.extend(this.cache[e], b);else for (d in b) {
        f[d] = b[d];
      }return f;
    }, get: function get(a, b) {
      var c = this.cache[this.key(a)];return void 0 === b ? c : c[b];
    }, access: function access(a, b, c) {
      var d;return void 0 === b || b && "string" == typeof b && void 0 === c ? (d = this.get(a, b), void 0 !== d ? d : this.get(a, n.camelCase(b))) : (this.set(a, b, c), void 0 !== c ? c : b);
    }, remove: function remove(a, b) {
      var c,
          d,
          e,
          f = this.key(a),
          g = this.cache[f];if (void 0 === b) this.cache[f] = {};else {
        n.isArray(b) ? d = b.concat(b.map(n.camelCase)) : (e = n.camelCase(b), b in g ? d = [b, e] : (d = e, d = d in g ? [d] : d.match(E) || [])), c = d.length;while (c--) {
          delete g[d[c]];
        }
      }
    }, hasData: function hasData(a) {
      return !n.isEmptyObject(this.cache[a[this.expando]] || {});
    }, discard: function discard(a) {
      a[this.expando] && delete this.cache[a[this.expando]];
    } };var L = new K(),
      M = new K(),
      N = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
      O = /([A-Z])/g;function P(a, b, c) {
    var d;if (void 0 === c && 1 === a.nodeType) if ((d = "data-" + b.replace(O, "-$1").toLowerCase(), c = a.getAttribute(d), "string" == typeof c)) {
      try {
        c = "true" === c ? !0 : "false" === c ? !1 : "null" === c ? null : +c + "" === c ? +c : N.test(c) ? n.parseJSON(c) : c;
      } catch (e) {}M.set(a, b, c);
    } else c = void 0;return c;
  }n.extend({ hasData: function hasData(a) {
      return M.hasData(a) || L.hasData(a);
    }, data: function data(a, b, c) {
      return M.access(a, b, c);
    }, removeData: function removeData(a, b) {
      M.remove(a, b);
    }, _data: function _data(a, b, c) {
      return L.access(a, b, c);
    }, _removeData: function _removeData(a, b) {
      L.remove(a, b);
    } }), n.fn.extend({ data: function data(a, b) {
      var c,
          d,
          e,
          f = this[0],
          g = f && f.attributes;if (void 0 === a) {
        if (this.length && (e = M.get(f), 1 === f.nodeType && !L.get(f, "hasDataAttrs"))) {
          c = g.length;while (c--) {
            g[c] && (d = g[c].name, 0 === d.indexOf("data-") && (d = n.camelCase(d.slice(5)), P(f, d, e[d])));
          }L.set(f, "hasDataAttrs", !0);
        }return e;
      }return "object" == (typeof a === "undefined" ? "undefined" : _typeof(a)) ? this.each(function () {
        M.set(this, a);
      }) : J(this, function (b) {
        var c,
            d = n.camelCase(a);if (f && void 0 === b) {
          if ((c = M.get(f, a), void 0 !== c)) return c;if ((c = M.get(f, d), void 0 !== c)) return c;if ((c = P(f, d, void 0), void 0 !== c)) return c;
        } else this.each(function () {
          var c = M.get(this, d);M.set(this, d, b), -1 !== a.indexOf("-") && void 0 !== c && M.set(this, a, b);
        });
      }, null, b, arguments.length > 1, null, !0);
    }, removeData: function removeData(a) {
      return this.each(function () {
        M.remove(this, a);
      });
    } }), n.extend({ queue: function queue(a, b, c) {
      var d;return a ? (b = (b || "fx") + "queue", d = L.get(a, b), c && (!d || n.isArray(c) ? d = L.access(a, b, n.makeArray(c)) : d.push(c)), d || []) : void 0;
    }, dequeue: function dequeue(a, b) {
      b = b || "fx";var c = n.queue(a, b),
          d = c.length,
          e = c.shift(),
          f = n._queueHooks(a, b),
          g = function g() {
        n.dequeue(a, b);
      };"inprogress" === e && (e = c.shift(), d--), e && ("fx" === b && c.unshift("inprogress"), delete f.stop, e.call(a, g, f)), !d && f && f.empty.fire();
    }, _queueHooks: function _queueHooks(a, b) {
      var c = b + "queueHooks";return L.get(a, c) || L.access(a, c, { empty: n.Callbacks("once memory").add(function () {
          L.remove(a, [b + "queue", c]);
        }) });
    } }), n.fn.extend({ queue: function queue(a, b) {
      var c = 2;return "string" != typeof a && (b = a, a = "fx", c--), arguments.length < c ? n.queue(this[0], a) : void 0 === b ? this : this.each(function () {
        var c = n.queue(this, a, b);n._queueHooks(this, a), "fx" === a && "inprogress" !== c[0] && n.dequeue(this, a);
      });
    }, dequeue: function dequeue(a) {
      return this.each(function () {
        n.dequeue(this, a);
      });
    }, clearQueue: function clearQueue(a) {
      return this.queue(a || "fx", []);
    }, promise: function promise(a, b) {
      var c,
          d = 1,
          e = n.Deferred(),
          f = this,
          g = this.length,
          h = function h() {
        --d || e.resolveWith(f, [f]);
      };"string" != typeof a && (b = a, a = void 0), a = a || "fx";while (g--) {
        c = L.get(f[g], a + "queueHooks"), c && c.empty && (d++, c.empty.add(h));
      }return h(), e.promise(b);
    } });var Q = /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,
      R = ["Top", "Right", "Bottom", "Left"],
      S = function S(a, b) {
    return a = b || a, "none" === n.css(a, "display") || !n.contains(a.ownerDocument, a);
  },
      T = /^(?:checkbox|radio)$/i;!(function () {
    var a = l.createDocumentFragment(),
        b = a.appendChild(l.createElement("div")),
        c = l.createElement("input");c.setAttribute("type", "radio"), c.setAttribute("checked", "checked"), c.setAttribute("name", "t"), b.appendChild(c), k.checkClone = b.cloneNode(!0).cloneNode(!0).lastChild.checked, b.innerHTML = "<textarea>x</textarea>", k.noCloneChecked = !!b.cloneNode(!0).lastChild.defaultValue;
  })();var U = "undefined";k.focusinBubbles = "onfocusin" in a;var V = /^key/,
      W = /^(?:mouse|pointer|contextmenu)|click/,
      X = /^(?:focusinfocus|focusoutblur)$/,
      Y = /^([^.]*)(?:\.(.+)|)$/;function Z() {
    return !0;
  }function $() {
    return !1;
  }function _() {
    try {
      return l.activeElement;
    } catch (a) {}
  }n.event = { global: {}, add: function add(a, b, c, d, e) {
      var f,
          g,
          h,
          i,
          j,
          k,
          l,
          m,
          o,
          p,
          q,
          r = L.get(a);if (r) {
        c.handler && (f = c, c = f.handler, e = f.selector), c.guid || (c.guid = n.guid++), (i = r.events) || (i = r.events = {}), (g = r.handle) || (g = r.handle = function (b) {
          return (typeof n === "undefined" ? "undefined" : _typeof(n)) !== U && n.event.triggered !== b.type ? n.event.dispatch.apply(a, arguments) : void 0;
        }), b = (b || "").match(E) || [""], j = b.length;while (j--) {
          h = Y.exec(b[j]) || [], o = q = h[1], p = (h[2] || "").split(".").sort(), o && (l = n.event.special[o] || {}, o = (e ? l.delegateType : l.bindType) || o, l = n.event.special[o] || {}, k = n.extend({ type: o, origType: q, data: d, handler: c, guid: c.guid, selector: e, needsContext: e && n.expr.match.needsContext.test(e), namespace: p.join(".") }, f), (m = i[o]) || (m = i[o] = [], m.delegateCount = 0, l.setup && l.setup.call(a, d, p, g) !== !1 || a.addEventListener && a.addEventListener(o, g, !1)), l.add && (l.add.call(a, k), k.handler.guid || (k.handler.guid = c.guid)), e ? m.splice(m.delegateCount++, 0, k) : m.push(k), n.event.global[o] = !0);
        }
      }
    }, remove: function remove(a, b, c, d, e) {
      var f,
          g,
          h,
          i,
          j,
          k,
          l,
          m,
          o,
          p,
          q,
          r = L.hasData(a) && L.get(a);if (r && (i = r.events)) {
        b = (b || "").match(E) || [""], j = b.length;while (j--) {
          if ((h = Y.exec(b[j]) || [], o = q = h[1], p = (h[2] || "").split(".").sort(), o)) {
            l = n.event.special[o] || {}, o = (d ? l.delegateType : l.bindType) || o, m = i[o] || [], h = h[2] && new RegExp("(^|\\.)" + p.join("\\.(?:.*\\.|)") + "(\\.|$)"), g = f = m.length;while (f--) {
              k = m[f], !e && q !== k.origType || c && c.guid !== k.guid || h && !h.test(k.namespace) || d && d !== k.selector && ("**" !== d || !k.selector) || (m.splice(f, 1), k.selector && m.delegateCount--, l.remove && l.remove.call(a, k));
            }g && !m.length && (l.teardown && l.teardown.call(a, p, r.handle) !== !1 || n.removeEvent(a, o, r.handle), delete i[o]);
          } else for (o in i) {
            n.event.remove(a, o + b[j], c, d, !0);
          }
        }n.isEmptyObject(i) && (delete r.handle, L.remove(a, "events"));
      }
    }, trigger: function trigger(b, c, d, e) {
      var f,
          g,
          h,
          i,
          k,
          m,
          o,
          p = [d || l],
          q = j.call(b, "type") ? b.type : b,
          r = j.call(b, "namespace") ? b.namespace.split(".") : [];if ((g = h = d = d || l, 3 !== d.nodeType && 8 !== d.nodeType && !X.test(q + n.event.triggered) && (q.indexOf(".") >= 0 && (r = q.split("."), q = r.shift(), r.sort()), k = q.indexOf(":") < 0 && "on" + q, b = b[n.expando] ? b : new n.Event(q, "object" == (typeof b === "undefined" ? "undefined" : _typeof(b)) && b), b.isTrigger = e ? 2 : 3, b.namespace = r.join("."), b.namespace_re = b.namespace ? new RegExp("(^|\\.)" + r.join("\\.(?:.*\\.|)") + "(\\.|$)") : null, b.result = void 0, b.target || (b.target = d), c = null == c ? [b] : n.makeArray(c, [b]), o = n.event.special[q] || {}, e || !o.trigger || o.trigger.apply(d, c) !== !1))) {
        if (!e && !o.noBubble && !n.isWindow(d)) {
          for (i = o.delegateType || q, X.test(i + q) || (g = g.parentNode); g; g = g.parentNode) {
            p.push(g), h = g;
          }h === (d.ownerDocument || l) && p.push(h.defaultView || h.parentWindow || a);
        }f = 0;while ((g = p[f++]) && !b.isPropagationStopped()) {
          b.type = f > 1 ? i : o.bindType || q, m = (L.get(g, "events") || {})[b.type] && L.get(g, "handle"), m && m.apply(g, c), m = k && g[k], m && m.apply && n.acceptData(g) && (b.result = m.apply(g, c), b.result === !1 && b.preventDefault());
        }return b.type = q, e || b.isDefaultPrevented() || o._default && o._default.apply(p.pop(), c) !== !1 || !n.acceptData(d) || k && n.isFunction(d[q]) && !n.isWindow(d) && (h = d[k], h && (d[k] = null), n.event.triggered = q, d[q](), n.event.triggered = void 0, h && (d[k] = h)), b.result;
      }
    }, dispatch: function dispatch(a) {
      a = n.event.fix(a);var b,
          c,
          e,
          f,
          g,
          h = [],
          i = d.call(arguments),
          j = (L.get(this, "events") || {})[a.type] || [],
          k = n.event.special[a.type] || {};if ((i[0] = a, a.delegateTarget = this, !k.preDispatch || k.preDispatch.call(this, a) !== !1)) {
        h = n.event.handlers.call(this, a, j), b = 0;while ((f = h[b++]) && !a.isPropagationStopped()) {
          a.currentTarget = f.elem, c = 0;while ((g = f.handlers[c++]) && !a.isImmediatePropagationStopped()) {
            (!a.namespace_re || a.namespace_re.test(g.namespace)) && (a.handleObj = g, a.data = g.data, e = ((n.event.special[g.origType] || {}).handle || g.handler).apply(f.elem, i), void 0 !== e && (a.result = e) === !1 && (a.preventDefault(), a.stopPropagation()));
          }
        }return k.postDispatch && k.postDispatch.call(this, a), a.result;
      }
    }, handlers: function handlers(a, b) {
      var c,
          d,
          e,
          f,
          g = [],
          h = b.delegateCount,
          i = a.target;if (h && i.nodeType && (!a.button || "click" !== a.type)) for (; i !== this; i = i.parentNode || this) {
        if (i.disabled !== !0 || "click" !== a.type) {
          for (d = [], c = 0; h > c; c++) {
            f = b[c], e = f.selector + " ", void 0 === d[e] && (d[e] = f.needsContext ? n(e, this).index(i) >= 0 : n.find(e, this, null, [i]).length), d[e] && d.push(f);
          }d.length && g.push({ elem: i, handlers: d });
        }
      }return h < b.length && g.push({ elem: this, handlers: b.slice(h) }), g;
    }, props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "), fixHooks: {}, keyHooks: { props: "char charCode key keyCode".split(" "), filter: function filter(a, b) {
        return null == a.which && (a.which = null != b.charCode ? b.charCode : b.keyCode), a;
      } }, mouseHooks: { props: "button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "), filter: function filter(a, b) {
        var c,
            d,
            e,
            f = b.button;return null == a.pageX && null != b.clientX && (c = a.target.ownerDocument || l, d = c.documentElement, e = c.body, a.pageX = b.clientX + (d && d.scrollLeft || e && e.scrollLeft || 0) - (d && d.clientLeft || e && e.clientLeft || 0), a.pageY = b.clientY + (d && d.scrollTop || e && e.scrollTop || 0) - (d && d.clientTop || e && e.clientTop || 0)), a.which || void 0 === f || (a.which = 1 & f ? 1 : 2 & f ? 3 : 4 & f ? 2 : 0), a;
      } }, fix: function fix(a) {
      if (a[n.expando]) return a;var b,
          c,
          d,
          e = a.type,
          f = a,
          g = this.fixHooks[e];g || (this.fixHooks[e] = g = W.test(e) ? this.mouseHooks : V.test(e) ? this.keyHooks : {}), d = g.props ? this.props.concat(g.props) : this.props, a = new n.Event(f), b = d.length;while (b--) {
        c = d[b], a[c] = f[c];
      }return a.target || (a.target = l), 3 === a.target.nodeType && (a.target = a.target.parentNode), g.filter ? g.filter(a, f) : a;
    }, special: { load: { noBubble: !0 }, focus: { trigger: function trigger() {
          return this !== _() && this.focus ? (this.focus(), !1) : void 0;
        }, delegateType: "focusin" }, blur: { trigger: function trigger() {
          return this === _() && this.blur ? (this.blur(), !1) : void 0;
        }, delegateType: "focusout" }, click: { trigger: function trigger() {
          return "checkbox" === this.type && this.click && n.nodeName(this, "input") ? (this.click(), !1) : void 0;
        }, _default: function _default(a) {
          return n.nodeName(a.target, "a");
        } }, beforeunload: { postDispatch: function postDispatch(a) {
          void 0 !== a.result && a.originalEvent && (a.originalEvent.returnValue = a.result);
        } } }, simulate: function simulate(a, b, c, d) {
      var e = n.extend(new n.Event(), c, { type: a, isSimulated: !0, originalEvent: {} });d ? n.event.trigger(e, null, b) : n.event.dispatch.call(b, e), e.isDefaultPrevented() && c.preventDefault();
    } }, n.removeEvent = function (a, b, c) {
    a.removeEventListener && a.removeEventListener(b, c, !1);
  }, n.Event = function (a, b) {
    return this instanceof n.Event ? (a && a.type ? (this.originalEvent = a, this.type = a.type, this.isDefaultPrevented = a.defaultPrevented || void 0 === a.defaultPrevented && a.returnValue === !1 ? Z : $) : this.type = a, b && n.extend(this, b), this.timeStamp = a && a.timeStamp || n.now(), void (this[n.expando] = !0)) : new n.Event(a, b);
  }, n.Event.prototype = { isDefaultPrevented: $, isPropagationStopped: $, isImmediatePropagationStopped: $, preventDefault: function preventDefault() {
      var a = this.originalEvent;this.isDefaultPrevented = Z, a && a.preventDefault && a.preventDefault();
    }, stopPropagation: function stopPropagation() {
      var a = this.originalEvent;this.isPropagationStopped = Z, a && a.stopPropagation && a.stopPropagation();
    }, stopImmediatePropagation: function stopImmediatePropagation() {
      var a = this.originalEvent;this.isImmediatePropagationStopped = Z, a && a.stopImmediatePropagation && a.stopImmediatePropagation(), this.stopPropagation();
    } }, n.each({ mouseenter: "mouseover", mouseleave: "mouseout", pointerenter: "pointerover", pointerleave: "pointerout" }, function (a, b) {
    n.event.special[a] = { delegateType: b, bindType: b, handle: function handle(a) {
        var c,
            d = this,
            e = a.relatedTarget,
            f = a.handleObj;return (!e || e !== d && !n.contains(d, e)) && (a.type = f.origType, c = f.handler.apply(this, arguments), a.type = b), c;
      } };
  }), k.focusinBubbles || n.each({ focus: "focusin", blur: "focusout" }, function (a, b) {
    var c = function c(a) {
      n.event.simulate(b, a.target, n.event.fix(a), !0);
    };n.event.special[b] = { setup: function setup() {
        var d = this.ownerDocument || this,
            e = L.access(d, b);e || d.addEventListener(a, c, !0), L.access(d, b, (e || 0) + 1);
      }, teardown: function teardown() {
        var d = this.ownerDocument || this,
            e = L.access(d, b) - 1;e ? L.access(d, b, e) : (d.removeEventListener(a, c, !0), L.remove(d, b));
      } };
  }), n.fn.extend({ on: function on(a, b, c, d, e) {
      var f, g;if ("object" == (typeof a === "undefined" ? "undefined" : _typeof(a))) {
        "string" != typeof b && (c = c || b, b = void 0);for (g in a) {
          this.on(g, b, c, a[g], e);
        }return this;
      }if ((null == c && null == d ? (d = b, c = b = void 0) : null == d && ("string" == typeof b ? (d = c, c = void 0) : (d = c, c = b, b = void 0)), d === !1)) d = $;else if (!d) return this;return 1 === e && (f = d, d = function (a) {
        return n().off(a), f.apply(this, arguments);
      }, d.guid = f.guid || (f.guid = n.guid++)), this.each(function () {
        n.event.add(this, a, d, c, b);
      });
    }, one: function one(a, b, c, d) {
      return this.on(a, b, c, d, 1);
    }, off: function off(a, b, c) {
      var d, e;if (a && a.preventDefault && a.handleObj) return d = a.handleObj, n(a.delegateTarget).off(d.namespace ? d.origType + "." + d.namespace : d.origType, d.selector, d.handler), this;if ("object" == (typeof a === "undefined" ? "undefined" : _typeof(a))) {
        for (e in a) {
          this.off(e, b, a[e]);
        }return this;
      }return (b === !1 || "function" == typeof b) && (c = b, b = void 0), c === !1 && (c = $), this.each(function () {
        n.event.remove(this, a, c, b);
      });
    }, trigger: function trigger(a, b) {
      return this.each(function () {
        n.event.trigger(a, b, this);
      });
    }, triggerHandler: function triggerHandler(a, b) {
      var c = this[0];return c ? n.event.trigger(a, b, c, !0) : void 0;
    } });var aa = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
      ba = /<([\w:]+)/,
      ca = /<|&#?\w+;/,
      da = /<(?:script|style|link)/i,
      ea = /checked\s*(?:[^=]|=\s*.checked.)/i,
      fa = /^$|\/(?:java|ecma)script/i,
      ga = /^true\/(.*)/,
      ha = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,
      ia = { option: [1, "<select multiple='multiple'>", "</select>"], thead: [1, "<table>", "</table>"], col: [2, "<table><colgroup>", "</colgroup></table>"], tr: [2, "<table><tbody>", "</tbody></table>"], td: [3, "<table><tbody><tr>", "</tr></tbody></table>"], _default: [0, "", ""] };ia.optgroup = ia.option, ia.tbody = ia.tfoot = ia.colgroup = ia.caption = ia.thead, ia.th = ia.td;function ja(a, b) {
    return n.nodeName(a, "table") && n.nodeName(11 !== b.nodeType ? b : b.firstChild, "tr") ? a.getElementsByTagName("tbody")[0] || a.appendChild(a.ownerDocument.createElement("tbody")) : a;
  }function ka(a) {
    return a.type = (null !== a.getAttribute("type")) + "/" + a.type, a;
  }function la(a) {
    var b = ga.exec(a.type);return b ? a.type = b[1] : a.removeAttribute("type"), a;
  }function ma(a, b) {
    for (var c = 0, d = a.length; d > c; c++) {
      L.set(a[c], "globalEval", !b || L.get(b[c], "globalEval"));
    }
  }function na(a, b) {
    var c, d, e, f, g, h, i, j;if (1 === b.nodeType) {
      if (L.hasData(a) && (f = L.access(a), g = L.set(b, f), j = f.events)) {
        delete g.handle, g.events = {};for (e in j) {
          for (c = 0, d = j[e].length; d > c; c++) {
            n.event.add(b, e, j[e][c]);
          }
        }
      }M.hasData(a) && (h = M.access(a), i = n.extend({}, h), M.set(b, i));
    }
  }function oa(a, b) {
    var c = a.getElementsByTagName ? a.getElementsByTagName(b || "*") : a.querySelectorAll ? a.querySelectorAll(b || "*") : [];return void 0 === b || b && n.nodeName(a, b) ? n.merge([a], c) : c;
  }function pa(a, b) {
    var c = b.nodeName.toLowerCase();"input" === c && T.test(a.type) ? b.checked = a.checked : ("input" === c || "textarea" === c) && (b.defaultValue = a.defaultValue);
  }n.extend({ clone: function clone(a, b, c) {
      var d,
          e,
          f,
          g,
          h = a.cloneNode(!0),
          i = n.contains(a.ownerDocument, a);if (!(k.noCloneChecked || 1 !== a.nodeType && 11 !== a.nodeType || n.isXMLDoc(a))) for (g = oa(h), f = oa(a), d = 0, e = f.length; e > d; d++) {
        pa(f[d], g[d]);
      }if (b) if (c) for (f = f || oa(a), g = g || oa(h), d = 0, e = f.length; e > d; d++) {
        na(f[d], g[d]);
      } else na(a, h);return g = oa(h, "script"), g.length > 0 && ma(g, !i && oa(a, "script")), h;
    }, buildFragment: function buildFragment(a, b, c, d) {
      for (var e, f, g, h, i, j, k = b.createDocumentFragment(), l = [], m = 0, o = a.length; o > m; m++) {
        if ((e = a[m], e || 0 === e)) if ("object" === n.type(e)) n.merge(l, e.nodeType ? [e] : e);else if (ca.test(e)) {
          f = f || k.appendChild(b.createElement("div")), g = (ba.exec(e) || ["", ""])[1].toLowerCase(), h = ia[g] || ia._default, f.innerHTML = h[1] + e.replace(aa, "<$1></$2>") + h[2], j = h[0];while (j--) {
            f = f.lastChild;
          }n.merge(l, f.childNodes), f = k.firstChild, f.textContent = "";
        } else l.push(b.createTextNode(e));
      }k.textContent = "", m = 0;while (e = l[m++]) {
        if ((!d || -1 === n.inArray(e, d)) && (i = n.contains(e.ownerDocument, e), f = oa(k.appendChild(e), "script"), i && ma(f), c)) {
          j = 0;while (e = f[j++]) {
            fa.test(e.type || "") && c.push(e);
          }
        }
      }return k;
    }, cleanData: function cleanData(a) {
      for (var b, c, d, e, f = n.event.special, g = 0; void 0 !== (c = a[g]); g++) {
        if (n.acceptData(c) && (e = c[L.expando], e && (b = L.cache[e]))) {
          if (b.events) for (d in b.events) {
            f[d] ? n.event.remove(c, d) : n.removeEvent(c, d, b.handle);
          }L.cache[e] && delete L.cache[e];
        }delete M.cache[c[M.expando]];
      }
    } }), n.fn.extend({ text: function text(a) {
      return J(this, function (a) {
        return void 0 === a ? n.text(this) : this.empty().each(function () {
          (1 === this.nodeType || 11 === this.nodeType || 9 === this.nodeType) && (this.textContent = a);
        });
      }, null, a, arguments.length);
    }, append: function append() {
      return this.domManip(arguments, function (a) {
        if (1 === this.nodeType || 11 === this.nodeType || 9 === this.nodeType) {
          var b = ja(this, a);b.appendChild(a);
        }
      });
    }, prepend: function prepend() {
      return this.domManip(arguments, function (a) {
        if (1 === this.nodeType || 11 === this.nodeType || 9 === this.nodeType) {
          var b = ja(this, a);b.insertBefore(a, b.firstChild);
        }
      });
    }, before: function before() {
      return this.domManip(arguments, function (a) {
        this.parentNode && this.parentNode.insertBefore(a, this);
      });
    }, after: function after() {
      return this.domManip(arguments, function (a) {
        this.parentNode && this.parentNode.insertBefore(a, this.nextSibling);
      });
    }, remove: function remove(a, b) {
      for (var c, d = a ? n.filter(a, this) : this, e = 0; null != (c = d[e]); e++) {
        b || 1 !== c.nodeType || n.cleanData(oa(c)), c.parentNode && (b && n.contains(c.ownerDocument, c) && ma(oa(c, "script")), c.parentNode.removeChild(c));
      }return this;
    }, empty: function empty() {
      for (var a, b = 0; null != (a = this[b]); b++) {
        1 === a.nodeType && (n.cleanData(oa(a, !1)), a.textContent = "");
      }return this;
    }, clone: function clone(a, b) {
      return a = null == a ? !1 : a, b = null == b ? a : b, this.map(function () {
        return n.clone(this, a, b);
      });
    }, html: function html(a) {
      return J(this, function (a) {
        var b = this[0] || {},
            c = 0,
            d = this.length;if (void 0 === a && 1 === b.nodeType) return b.innerHTML;if ("string" == typeof a && !da.test(a) && !ia[(ba.exec(a) || ["", ""])[1].toLowerCase()]) {
          a = a.replace(aa, "<$1></$2>");try {
            for (; d > c; c++) {
              b = this[c] || {}, 1 === b.nodeType && (n.cleanData(oa(b, !1)), b.innerHTML = a);
            }b = 0;
          } catch (e) {}
        }b && this.empty().append(a);
      }, null, a, arguments.length);
    }, replaceWith: function replaceWith() {
      var a = arguments[0];return this.domManip(arguments, function (b) {
        a = this.parentNode, n.cleanData(oa(this)), a && a.replaceChild(b, this);
      }), a && (a.length || a.nodeType) ? this : this.remove();
    }, detach: function detach(a) {
      return this.remove(a, !0);
    }, domManip: function domManip(a, b) {
      a = e.apply([], a);var c,
          d,
          f,
          g,
          h,
          i,
          j = 0,
          l = this.length,
          m = this,
          o = l - 1,
          p = a[0],
          q = n.isFunction(p);if (q || l > 1 && "string" == typeof p && !k.checkClone && ea.test(p)) return this.each(function (c) {
        var d = m.eq(c);q && (a[0] = p.call(this, c, d.html())), d.domManip(a, b);
      });if (l && (c = n.buildFragment(a, this[0].ownerDocument, !1, this), d = c.firstChild, 1 === c.childNodes.length && (c = d), d)) {
        for (f = n.map(oa(c, "script"), ka), g = f.length; l > j; j++) {
          h = c, j !== o && (h = n.clone(h, !0, !0), g && n.merge(f, oa(h, "script"))), b.call(this[j], h, j);
        }if (g) for (i = f[f.length - 1].ownerDocument, n.map(f, la), j = 0; g > j; j++) {
          h = f[j], fa.test(h.type || "") && !L.access(h, "globalEval") && n.contains(i, h) && (h.src ? n._evalUrl && n._evalUrl(h.src) : n.globalEval(h.textContent.replace(ha, "")));
        }
      }return this;
    } }), n.each({ appendTo: "append", prependTo: "prepend", insertBefore: "before", insertAfter: "after", replaceAll: "replaceWith" }, function (a, b) {
    n.fn[a] = function (a) {
      for (var c, d = [], e = n(a), g = e.length - 1, h = 0; g >= h; h++) {
        c = h === g ? this : this.clone(!0), n(e[h])[b](c), f.apply(d, c.get());
      }return this.pushStack(d);
    };
  });var qa,
      ra = {};function sa(b, c) {
    var d,
        e = n(c.createElement(b)).appendTo(c.body),
        f = a.getDefaultComputedStyle && (d = a.getDefaultComputedStyle(e[0])) ? d.display : n.css(e[0], "display");return e.detach(), f;
  }function ta(a) {
    var b = l,
        c = ra[a];return c || (c = sa(a, b), "none" !== c && c || (qa = (qa || n("<iframe frameborder='0' width='0' height='0'/>")).appendTo(b.documentElement), b = qa[0].contentDocument, b.write(), b.close(), c = sa(a, b), qa.detach()), ra[a] = c), c;
  }var ua = /^margin/,
      va = new RegExp("^(" + Q + ")(?!px)[a-z%]+$", "i"),
      wa = function wa(b) {
    return b.ownerDocument.defaultView.opener ? b.ownerDocument.defaultView.getComputedStyle(b, null) : a.getComputedStyle(b, null);
  };function xa(a, b, c) {
    var d,
        e,
        f,
        g,
        h = a.style;return c = c || wa(a), c && (g = c.getPropertyValue(b) || c[b]), c && ("" !== g || n.contains(a.ownerDocument, a) || (g = n.style(a, b)), va.test(g) && ua.test(b) && (d = h.width, e = h.minWidth, f = h.maxWidth, h.minWidth = h.maxWidth = h.width = g, g = c.width, h.width = d, h.minWidth = e, h.maxWidth = f)), void 0 !== g ? g + "" : g;
  }function ya(a, b) {
    return { get: function get() {
        return a() ? void delete this.get : (this.get = b).apply(this, arguments);
      } };
  }!(function () {
    var b,
        c,
        d = l.documentElement,
        e = l.createElement("div"),
        f = l.createElement("div");if (f.style) {
      (function () {
        var g = function g() {
          f.style.cssText = "-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;display:block;margin-top:1%;top:1%;border:1px;padding:1px;width:4px;position:absolute", f.innerHTML = "", d.appendChild(e);var g = a.getComputedStyle(f, null);b = "1%" !== g.top, c = "4px" === g.width, d.removeChild(e);
        };

        f.style.backgroundClip = "content-box", f.cloneNode(!0).style.backgroundClip = "", k.clearCloneStyle = "content-box" === f.style.backgroundClip, e.style.cssText = "border:0;width:0;height:0;top:0;left:-9999px;margin-top:1px;position:absolute", e.appendChild(f);a.getComputedStyle && n.extend(k, { pixelPosition: function pixelPosition() {
            return g(), b;
          }, boxSizingReliable: function boxSizingReliable() {
            return null == c && g(), c;
          }, reliableMarginRight: function reliableMarginRight() {
            var b,
                c = f.appendChild(l.createElement("div"));return c.style.cssText = f.style.cssText = "-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:0", c.style.marginRight = c.style.width = "0", f.style.width = "1px", d.appendChild(e), b = !parseFloat(a.getComputedStyle(c, null).marginRight), d.removeChild(e), f.removeChild(c), b;
          } });
      })();
    }
  })(), n.swap = function (a, b, c, d) {
    var e,
        f,
        g = {};for (f in b) {
      g[f] = a.style[f], a.style[f] = b[f];
    }e = c.apply(a, d || []);for (f in b) {
      a.style[f] = g[f];
    }return e;
  };var za = /^(none|table(?!-c[ea]).+)/,
      Aa = new RegExp("^(" + Q + ")(.*)$", "i"),
      Ba = new RegExp("^([+-])=(" + Q + ")", "i"),
      Ca = { position: "absolute", visibility: "hidden", display: "block" },
      Da = { letterSpacing: "0", fontWeight: "400" },
      Ea = ["Webkit", "O", "Moz", "ms"];function Fa(a, b) {
    if (b in a) return b;var c = b[0].toUpperCase() + b.slice(1),
        d = b,
        e = Ea.length;while (e--) {
      if ((b = Ea[e] + c, b in a)) return b;
    }return d;
  }function Ga(a, b, c) {
    var d = Aa.exec(b);return d ? Math.max(0, d[1] - (c || 0)) + (d[2] || "px") : b;
  }function Ha(a, b, c, d, e) {
    for (var f = c === (d ? "border" : "content") ? 4 : "width" === b ? 1 : 0, g = 0; 4 > f; f += 2) {
      "margin" === c && (g += n.css(a, c + R[f], !0, e)), d ? ("content" === c && (g -= n.css(a, "padding" + R[f], !0, e)), "margin" !== c && (g -= n.css(a, "border" + R[f] + "Width", !0, e))) : (g += n.css(a, "padding" + R[f], !0, e), "padding" !== c && (g += n.css(a, "border" + R[f] + "Width", !0, e)));
    }return g;
  }function Ia(a, b, c) {
    var d = !0,
        e = "width" === b ? a.offsetWidth : a.offsetHeight,
        f = wa(a),
        g = "border-box" === n.css(a, "boxSizing", !1, f);if (0 >= e || null == e) {
      if ((e = xa(a, b, f), (0 > e || null == e) && (e = a.style[b]), va.test(e))) return e;d = g && (k.boxSizingReliable() || e === a.style[b]), e = parseFloat(e) || 0;
    }return e + Ha(a, b, c || (g ? "border" : "content"), d, f) + "px";
  }function Ja(a, b) {
    for (var c, d, e, f = [], g = 0, h = a.length; h > g; g++) {
      d = a[g], d.style && (f[g] = L.get(d, "olddisplay"), c = d.style.display, b ? (f[g] || "none" !== c || (d.style.display = ""), "" === d.style.display && S(d) && (f[g] = L.access(d, "olddisplay", ta(d.nodeName)))) : (e = S(d), "none" === c && e || L.set(d, "olddisplay", e ? c : n.css(d, "display"))));
    }for (g = 0; h > g; g++) {
      d = a[g], d.style && (b && "none" !== d.style.display && "" !== d.style.display || (d.style.display = b ? f[g] || "" : "none"));
    }return a;
  }n.extend({ cssHooks: { opacity: { get: function get(a, b) {
          if (b) {
            var c = xa(a, "opacity");return "" === c ? "1" : c;
          }
        } } }, cssNumber: { columnCount: !0, fillOpacity: !0, flexGrow: !0, flexShrink: !0, fontWeight: !0, lineHeight: !0, opacity: !0, order: !0, orphans: !0, widows: !0, zIndex: !0, zoom: !0 }, cssProps: { "float": "cssFloat" }, style: function style(a, b, c, d) {
      if (a && 3 !== a.nodeType && 8 !== a.nodeType && a.style) {
        var e,
            f,
            g,
            h = n.camelCase(b),
            i = a.style;return b = n.cssProps[h] || (n.cssProps[h] = Fa(i, h)), g = n.cssHooks[b] || n.cssHooks[h], void 0 === c ? g && "get" in g && void 0 !== (e = g.get(a, !1, d)) ? e : i[b] : (f = typeof c === "undefined" ? "undefined" : _typeof(c), "string" === f && (e = Ba.exec(c)) && (c = (e[1] + 1) * e[2] + parseFloat(n.css(a, b)), f = "number"), null != c && c === c && ("number" !== f || n.cssNumber[h] || (c += "px"), k.clearCloneStyle || "" !== c || 0 !== b.indexOf("background") || (i[b] = "inherit"), g && "set" in g && void 0 === (c = g.set(a, c, d)) || (i[b] = c)), void 0);
      }
    }, css: function css(a, b, c, d) {
      var e,
          f,
          g,
          h = n.camelCase(b);return b = n.cssProps[h] || (n.cssProps[h] = Fa(a.style, h)), g = n.cssHooks[b] || n.cssHooks[h], g && "get" in g && (e = g.get(a, !0, c)), void 0 === e && (e = xa(a, b, d)), "normal" === e && b in Da && (e = Da[b]), "" === c || c ? (f = parseFloat(e), c === !0 || n.isNumeric(f) ? f || 0 : e) : e;
    } }), n.each(["height", "width"], function (a, b) {
    n.cssHooks[b] = { get: function get(a, c, d) {
        return c ? za.test(n.css(a, "display")) && 0 === a.offsetWidth ? n.swap(a, Ca, function () {
          return Ia(a, b, d);
        }) : Ia(a, b, d) : void 0;
      }, set: function set(a, c, d) {
        var e = d && wa(a);return Ga(a, c, d ? Ha(a, b, d, "border-box" === n.css(a, "boxSizing", !1, e), e) : 0);
      } };
  }), n.cssHooks.marginRight = ya(k.reliableMarginRight, function (a, b) {
    return b ? n.swap(a, { display: "inline-block" }, xa, [a, "marginRight"]) : void 0;
  }), n.each({ margin: "", padding: "", border: "Width" }, function (a, b) {
    n.cssHooks[a + b] = { expand: function expand(c) {
        for (var d = 0, e = {}, f = "string" == typeof c ? c.split(" ") : [c]; 4 > d; d++) {
          e[a + R[d] + b] = f[d] || f[d - 2] || f[0];
        }return e;
      } }, ua.test(a) || (n.cssHooks[a + b].set = Ga);
  }), n.fn.extend({ css: function css(a, b) {
      return J(this, function (a, b, c) {
        var d,
            e,
            f = {},
            g = 0;if (n.isArray(b)) {
          for (d = wa(a), e = b.length; e > g; g++) {
            f[b[g]] = n.css(a, b[g], !1, d);
          }return f;
        }return void 0 !== c ? n.style(a, b, c) : n.css(a, b);
      }, a, b, arguments.length > 1);
    }, show: function show() {
      return Ja(this, !0);
    }, hide: function hide() {
      return Ja(this);
    }, toggle: function toggle(a) {
      return "boolean" == typeof a ? a ? this.show() : this.hide() : this.each(function () {
        S(this) ? n(this).show() : n(this).hide();
      });
    } });function Ka(a, b, c, d, e) {
    return new Ka.prototype.init(a, b, c, d, e);
  }n.Tween = Ka, Ka.prototype = { constructor: Ka, init: function init(a, b, c, d, e, f) {
      this.elem = a, this.prop = c, this.easing = e || "swing", this.options = b, this.start = this.now = this.cur(), this.end = d, this.unit = f || (n.cssNumber[c] ? "" : "px");
    }, cur: function cur() {
      var a = Ka.propHooks[this.prop];return a && a.get ? a.get(this) : Ka.propHooks._default.get(this);
    }, run: function run(a) {
      var b,
          c = Ka.propHooks[this.prop];return this.options.duration ? this.pos = b = n.easing[this.easing](a, this.options.duration * a, 0, 1, this.options.duration) : this.pos = b = a, this.now = (this.end - this.start) * b + this.start, this.options.step && this.options.step.call(this.elem, this.now, this), c && c.set ? c.set(this) : Ka.propHooks._default.set(this), this;
    } }, Ka.prototype.init.prototype = Ka.prototype, Ka.propHooks = { _default: { get: function get(a) {
        var b;return null == a.elem[a.prop] || a.elem.style && null != a.elem.style[a.prop] ? (b = n.css(a.elem, a.prop, ""), b && "auto" !== b ? b : 0) : a.elem[a.prop];
      }, set: function set(a) {
        n.fx.step[a.prop] ? n.fx.step[a.prop](a) : a.elem.style && (null != a.elem.style[n.cssProps[a.prop]] || n.cssHooks[a.prop]) ? n.style(a.elem, a.prop, a.now + a.unit) : a.elem[a.prop] = a.now;
      } } }, Ka.propHooks.scrollTop = Ka.propHooks.scrollLeft = { set: function set(a) {
      a.elem.nodeType && a.elem.parentNode && (a.elem[a.prop] = a.now);
    } }, n.easing = { linear: function linear(a) {
      return a;
    }, swing: function swing(a) {
      return .5 - Math.cos(a * Math.PI) / 2;
    } }, n.fx = Ka.prototype.init, n.fx.step = {};var La,
      Ma,
      Na = /^(?:toggle|show|hide)$/,
      Oa = new RegExp("^(?:([+-])=|)(" + Q + ")([a-z%]*)$", "i"),
      Pa = /queueHooks$/,
      Qa = [Va],
      Ra = { "*": [function (a, b) {
      var c = this.createTween(a, b),
          d = c.cur(),
          e = Oa.exec(b),
          f = e && e[3] || (n.cssNumber[a] ? "" : "px"),
          g = (n.cssNumber[a] || "px" !== f && +d) && Oa.exec(n.css(c.elem, a)),
          h = 1,
          i = 20;if (g && g[3] !== f) {
        f = f || g[3], e = e || [], g = +d || 1;do {
          h = h || ".5", g /= h, n.style(c.elem, a, g + f);
        } while (h !== (h = c.cur() / d) && 1 !== h && --i);
      }return e && (g = c.start = +g || +d || 0, c.unit = f, c.end = e[1] ? g + (e[1] + 1) * e[2] : +e[2]), c;
    }] };function Sa() {
    return setTimeout(function () {
      La = void 0;
    }), La = n.now();
  }function Ta(a, b) {
    var c,
        d = 0,
        e = { height: a };for (b = b ? 1 : 0; 4 > d; d += 2 - b) {
      c = R[d], e["margin" + c] = e["padding" + c] = a;
    }return b && (e.opacity = e.width = a), e;
  }function Ua(a, b, c) {
    for (var d, e = (Ra[b] || []).concat(Ra["*"]), f = 0, g = e.length; g > f; f++) {
      if (d = e[f].call(c, b, a)) return d;
    }
  }function Va(a, b, c) {
    var d,
        e,
        f,
        g,
        h,
        i,
        j,
        k,
        l = this,
        m = {},
        o = a.style,
        p = a.nodeType && S(a),
        q = L.get(a, "fxshow");c.queue || (h = n._queueHooks(a, "fx"), null == h.unqueued && (h.unqueued = 0, i = h.empty.fire, h.empty.fire = function () {
      h.unqueued || i();
    }), h.unqueued++, l.always(function () {
      l.always(function () {
        h.unqueued--, n.queue(a, "fx").length || h.empty.fire();
      });
    })), 1 === a.nodeType && ("height" in b || "width" in b) && (c.overflow = [o.overflow, o.overflowX, o.overflowY], j = n.css(a, "display"), k = "none" === j ? L.get(a, "olddisplay") || ta(a.nodeName) : j, "inline" === k && "none" === n.css(a, "float") && (o.display = "inline-block")), c.overflow && (o.overflow = "hidden", l.always(function () {
      o.overflow = c.overflow[0], o.overflowX = c.overflow[1], o.overflowY = c.overflow[2];
    }));for (d in b) {
      if ((e = b[d], Na.exec(e))) {
        if ((delete b[d], f = f || "toggle" === e, e === (p ? "hide" : "show"))) {
          if ("show" !== e || !q || void 0 === q[d]) continue;p = !0;
        }m[d] = q && q[d] || n.style(a, d);
      } else j = void 0;
    }if (n.isEmptyObject(m)) "inline" === ("none" === j ? ta(a.nodeName) : j) && (o.display = j);else {
      q ? "hidden" in q && (p = q.hidden) : q = L.access(a, "fxshow", {}), f && (q.hidden = !p), p ? n(a).show() : l.done(function () {
        n(a).hide();
      }), l.done(function () {
        var b;L.remove(a, "fxshow");for (b in m) {
          n.style(a, b, m[b]);
        }
      });for (d in m) {
        g = Ua(p ? q[d] : 0, d, l), d in q || (q[d] = g.start, p && (g.end = g.start, g.start = "width" === d || "height" === d ? 1 : 0));
      }
    }
  }function Wa(a, b) {
    var c, d, e, f, g;for (c in a) {
      if ((d = n.camelCase(c), e = b[d], f = a[c], n.isArray(f) && (e = f[1], f = a[c] = f[0]), c !== d && (a[d] = f, delete a[c]), g = n.cssHooks[d], g && "expand" in g)) {
        f = g.expand(f), delete a[d];for (c in f) {
          c in a || (a[c] = f[c], b[c] = e);
        }
      } else b[d] = e;
    }
  }function Xa(a, b, c) {
    var d,
        e,
        f = 0,
        g = Qa.length,
        h = n.Deferred().always(function () {
      delete i.elem;
    }),
        i = function i() {
      if (e) return !1;for (var b = La || Sa(), c = Math.max(0, j.startTime + j.duration - b), d = c / j.duration || 0, f = 1 - d, g = 0, i = j.tweens.length; i > g; g++) {
        j.tweens[g].run(f);
      }return h.notifyWith(a, [j, f, c]), 1 > f && i ? c : (h.resolveWith(a, [j]), !1);
    },
        j = h.promise({ elem: a, props: n.extend({}, b), opts: n.extend(!0, { specialEasing: {} }, c), originalProperties: b, originalOptions: c, startTime: La || Sa(), duration: c.duration, tweens: [], createTween: function createTween(b, c) {
        var d = n.Tween(a, j.opts, b, c, j.opts.specialEasing[b] || j.opts.easing);return j.tweens.push(d), d;
      }, stop: function stop(b) {
        var c = 0,
            d = b ? j.tweens.length : 0;if (e) return this;for (e = !0; d > c; c++) {
          j.tweens[c].run(1);
        }return b ? h.resolveWith(a, [j, b]) : h.rejectWith(a, [j, b]), this;
      } }),
        k = j.props;for (Wa(k, j.opts.specialEasing); g > f; f++) {
      if (d = Qa[f].call(j, a, k, j.opts)) return d;
    }return n.map(k, Ua, j), n.isFunction(j.opts.start) && j.opts.start.call(a, j), n.fx.timer(n.extend(i, { elem: a, anim: j, queue: j.opts.queue })), j.progress(j.opts.progress).done(j.opts.done, j.opts.complete).fail(j.opts.fail).always(j.opts.always);
  }n.Animation = n.extend(Xa, { tweener: function tweener(a, b) {
      n.isFunction(a) ? (b = a, a = ["*"]) : a = a.split(" ");for (var c, d = 0, e = a.length; e > d; d++) {
        c = a[d], Ra[c] = Ra[c] || [], Ra[c].unshift(b);
      }
    }, prefilter: function prefilter(a, b) {
      b ? Qa.unshift(a) : Qa.push(a);
    } }), n.speed = function (a, b, c) {
    var d = a && "object" == (typeof a === "undefined" ? "undefined" : _typeof(a)) ? n.extend({}, a) : { complete: c || !c && b || n.isFunction(a) && a, duration: a, easing: c && b || b && !n.isFunction(b) && b };return d.duration = n.fx.off ? 0 : "number" == typeof d.duration ? d.duration : d.duration in n.fx.speeds ? n.fx.speeds[d.duration] : n.fx.speeds._default, (null == d.queue || d.queue === !0) && (d.queue = "fx"), d.old = d.complete, d.complete = function () {
      n.isFunction(d.old) && d.old.call(this), d.queue && n.dequeue(this, d.queue);
    }, d;
  }, n.fn.extend({ fadeTo: function fadeTo(a, b, c, d) {
      return this.filter(S).css("opacity", 0).show().end().animate({ opacity: b }, a, c, d);
    }, animate: function animate(a, b, c, d) {
      var e = n.isEmptyObject(a),
          f = n.speed(b, c, d),
          g = function g() {
        var b = Xa(this, n.extend({}, a), f);(e || L.get(this, "finish")) && b.stop(!0);
      };return g.finish = g, e || f.queue === !1 ? this.each(g) : this.queue(f.queue, g);
    }, stop: function stop(a, b, c) {
      var d = function d(a) {
        var b = a.stop;delete a.stop, b(c);
      };return "string" != typeof a && (c = b, b = a, a = void 0), b && a !== !1 && this.queue(a || "fx", []), this.each(function () {
        var b = !0,
            e = null != a && a + "queueHooks",
            f = n.timers,
            g = L.get(this);if (e) g[e] && g[e].stop && d(g[e]);else for (e in g) {
          g[e] && g[e].stop && Pa.test(e) && d(g[e]);
        }for (e = f.length; e--;) {
          f[e].elem !== this || null != a && f[e].queue !== a || (f[e].anim.stop(c), b = !1, f.splice(e, 1));
        }(b || !c) && n.dequeue(this, a);
      });
    }, finish: function finish(a) {
      return a !== !1 && (a = a || "fx"), this.each(function () {
        var b,
            c = L.get(this),
            d = c[a + "queue"],
            e = c[a + "queueHooks"],
            f = n.timers,
            g = d ? d.length : 0;for (c.finish = !0, n.queue(this, a, []), e && e.stop && e.stop.call(this, !0), b = f.length; b--;) {
          f[b].elem === this && f[b].queue === a && (f[b].anim.stop(!0), f.splice(b, 1));
        }for (b = 0; g > b; b++) {
          d[b] && d[b].finish && d[b].finish.call(this);
        }delete c.finish;
      });
    } }), n.each(["toggle", "show", "hide"], function (a, b) {
    var c = n.fn[b];n.fn[b] = function (a, d, e) {
      return null == a || "boolean" == typeof a ? c.apply(this, arguments) : this.animate(Ta(b, !0), a, d, e);
    };
  }), n.each({ slideDown: Ta("show"), slideUp: Ta("hide"), slideToggle: Ta("toggle"), fadeIn: { opacity: "show" }, fadeOut: { opacity: "hide" }, fadeToggle: { opacity: "toggle" } }, function (a, b) {
    n.fn[a] = function (a, c, d) {
      return this.animate(b, a, c, d);
    };
  }), n.timers = [], n.fx.tick = function () {
    var a,
        b = 0,
        c = n.timers;for (La = n.now(); b < c.length; b++) {
      a = c[b], a() || c[b] !== a || c.splice(b--, 1);
    }c.length || n.fx.stop(), La = void 0;
  }, n.fx.timer = function (a) {
    n.timers.push(a), a() ? n.fx.start() : n.timers.pop();
  }, n.fx.interval = 13, n.fx.start = function () {
    Ma || (Ma = setInterval(n.fx.tick, n.fx.interval));
  }, n.fx.stop = function () {
    clearInterval(Ma), Ma = null;
  }, n.fx.speeds = { slow: 600, fast: 200, _default: 400 }, n.fn.delay = function (a, b) {
    return a = n.fx ? n.fx.speeds[a] || a : a, b = b || "fx", this.queue(b, function (b, c) {
      var d = setTimeout(b, a);c.stop = function () {
        clearTimeout(d);
      };
    });
  }, (function () {
    var a = l.createElement("input"),
        b = l.createElement("select"),
        c = b.appendChild(l.createElement("option"));a.type = "checkbox", k.checkOn = "" !== a.value, k.optSelected = c.selected, b.disabled = !0, k.optDisabled = !c.disabled, a = l.createElement("input"), a.value = "t", a.type = "radio", k.radioValue = "t" === a.value;
  })();var Ya,
      Za,
      $a = n.expr.attrHandle;n.fn.extend({ attr: function attr(a, b) {
      return J(this, n.attr, a, b, arguments.length > 1);
    }, removeAttr: function removeAttr(a) {
      return this.each(function () {
        n.removeAttr(this, a);
      });
    } }), n.extend({ attr: function attr(a, b, c) {
      var d,
          e,
          f = a.nodeType;if (a && 3 !== f && 8 !== f && 2 !== f) return _typeof(a.getAttribute) === U ? n.prop(a, b, c) : (1 === f && n.isXMLDoc(a) || (b = b.toLowerCase(), d = n.attrHooks[b] || (n.expr.match.bool.test(b) ? Za : Ya)), void 0 === c ? d && "get" in d && null !== (e = d.get(a, b)) ? e : (e = n.find.attr(a, b), null == e ? void 0 : e) : null !== c ? d && "set" in d && void 0 !== (e = d.set(a, c, b)) ? e : (a.setAttribute(b, c + ""), c) : void n.removeAttr(a, b));
    }, removeAttr: function removeAttr(a, b) {
      var c,
          d,
          e = 0,
          f = b && b.match(E);if (f && 1 === a.nodeType) while (c = f[e++]) {
        d = n.propFix[c] || c, n.expr.match.bool.test(c) && (a[d] = !1), a.removeAttribute(c);
      }
    }, attrHooks: { type: { set: function set(a, b) {
          if (!k.radioValue && "radio" === b && n.nodeName(a, "input")) {
            var c = a.value;return a.setAttribute("type", b), c && (a.value = c), b;
          }
        } } } }), Za = { set: function set(a, b, c) {
      return b === !1 ? n.removeAttr(a, c) : a.setAttribute(c, c), c;
    } }, n.each(n.expr.match.bool.source.match(/\w+/g), function (a, b) {
    var c = $a[b] || n.find.attr;$a[b] = function (a, b, d) {
      var e, f;return d || (f = $a[b], $a[b] = e, e = null != c(a, b, d) ? b.toLowerCase() : null, $a[b] = f), e;
    };
  });var _a = /^(?:input|select|textarea|button)$/i;n.fn.extend({ prop: function prop(a, b) {
      return J(this, n.prop, a, b, arguments.length > 1);
    }, removeProp: function removeProp(a) {
      return this.each(function () {
        delete this[n.propFix[a] || a];
      });
    } }), n.extend({ propFix: { "for": "htmlFor", "class": "className" }, prop: function prop(a, b, c) {
      var d,
          e,
          f,
          g = a.nodeType;if (a && 3 !== g && 8 !== g && 2 !== g) return f = 1 !== g || !n.isXMLDoc(a), f && (b = n.propFix[b] || b, e = n.propHooks[b]), void 0 !== c ? e && "set" in e && void 0 !== (d = e.set(a, c, b)) ? d : a[b] = c : e && "get" in e && null !== (d = e.get(a, b)) ? d : a[b];
    }, propHooks: { tabIndex: { get: function get(a) {
          return a.hasAttribute("tabindex") || _a.test(a.nodeName) || a.href ? a.tabIndex : -1;
        } } } }), k.optSelected || (n.propHooks.selected = { get: function get(a) {
      var b = a.parentNode;return b && b.parentNode && b.parentNode.selectedIndex, null;
    } }), n.each(["tabIndex", "readOnly", "maxLength", "cellSpacing", "cellPadding", "rowSpan", "colSpan", "useMap", "frameBorder", "contentEditable"], function () {
    n.propFix[this.toLowerCase()] = this;
  });var ab = /[\t\r\n\f]/g;n.fn.extend({ addClass: function addClass(a) {
      var b,
          c,
          d,
          e,
          f,
          g,
          h = "string" == typeof a && a,
          i = 0,
          j = this.length;if (n.isFunction(a)) return this.each(function (b) {
        n(this).addClass(a.call(this, b, this.className));
      });if (h) for (b = (a || "").match(E) || []; j > i; i++) {
        if ((c = this[i], d = 1 === c.nodeType && (c.className ? (" " + c.className + " ").replace(ab, " ") : " "))) {
          f = 0;while (e = b[f++]) {
            d.indexOf(" " + e + " ") < 0 && (d += e + " ");
          }g = n.trim(d), c.className !== g && (c.className = g);
        }
      }return this;
    }, removeClass: function removeClass(a) {
      var b,
          c,
          d,
          e,
          f,
          g,
          h = 0 === arguments.length || "string" == typeof a && a,
          i = 0,
          j = this.length;if (n.isFunction(a)) return this.each(function (b) {
        n(this).removeClass(a.call(this, b, this.className));
      });if (h) for (b = (a || "").match(E) || []; j > i; i++) {
        if ((c = this[i], d = 1 === c.nodeType && (c.className ? (" " + c.className + " ").replace(ab, " ") : ""))) {
          f = 0;while (e = b[f++]) {
            while (d.indexOf(" " + e + " ") >= 0) {
              d = d.replace(" " + e + " ", " ");
            }
          }g = a ? n.trim(d) : "", c.className !== g && (c.className = g);
        }
      }return this;
    }, toggleClass: function toggleClass(a, b) {
      var c = typeof a === "undefined" ? "undefined" : _typeof(a);return "boolean" == typeof b && "string" === c ? b ? this.addClass(a) : this.removeClass(a) : this.each(n.isFunction(a) ? function (c) {
        n(this).toggleClass(a.call(this, c, this.className, b), b);
      } : function () {
        if ("string" === c) {
          var b,
              d = 0,
              e = n(this),
              f = a.match(E) || [];while (b = f[d++]) {
            e.hasClass(b) ? e.removeClass(b) : e.addClass(b);
          }
        } else (c === U || "boolean" === c) && (this.className && L.set(this, "__className__", this.className), this.className = this.className || a === !1 ? "" : L.get(this, "__className__") || "");
      });
    }, hasClass: function hasClass(a) {
      for (var b = " " + a + " ", c = 0, d = this.length; d > c; c++) {
        if (1 === this[c].nodeType && (" " + this[c].className + " ").replace(ab, " ").indexOf(b) >= 0) return !0;
      }return !1;
    } });var bb = /\r/g;n.fn.extend({ val: function val(a) {
      var b,
          c,
          d,
          e = this[0];{
        if (arguments.length) return d = n.isFunction(a), this.each(function (c) {
          var e;1 === this.nodeType && (e = d ? a.call(this, c, n(this).val()) : a, null == e ? e = "" : "number" == typeof e ? e += "" : n.isArray(e) && (e = n.map(e, function (a) {
            return null == a ? "" : a + "";
          })), b = n.valHooks[this.type] || n.valHooks[this.nodeName.toLowerCase()], b && "set" in b && void 0 !== b.set(this, e, "value") || (this.value = e));
        });if (e) return b = n.valHooks[e.type] || n.valHooks[e.nodeName.toLowerCase()], b && "get" in b && void 0 !== (c = b.get(e, "value")) ? c : (c = e.value, "string" == typeof c ? c.replace(bb, "") : null == c ? "" : c);
      }
    } }), n.extend({ valHooks: { option: { get: function get(a) {
          var b = n.find.attr(a, "value");return null != b ? b : n.trim(n.text(a));
        } }, select: { get: function get(a) {
          for (var b, c, d = a.options, e = a.selectedIndex, f = "select-one" === a.type || 0 > e, g = f ? null : [], h = f ? e + 1 : d.length, i = 0 > e ? h : f ? e : 0; h > i; i++) {
            if ((c = d[i], !(!c.selected && i !== e || (k.optDisabled ? c.disabled : null !== c.getAttribute("disabled")) || c.parentNode.disabled && n.nodeName(c.parentNode, "optgroup")))) {
              if ((b = n(c).val(), f)) return b;g.push(b);
            }
          }return g;
        }, set: function set(a, b) {
          var c,
              d,
              e = a.options,
              f = n.makeArray(b),
              g = e.length;while (g--) {
            d = e[g], (d.selected = n.inArray(d.value, f) >= 0) && (c = !0);
          }return c || (a.selectedIndex = -1), f;
        } } } }), n.each(["radio", "checkbox"], function () {
    n.valHooks[this] = { set: function set(a, b) {
        return n.isArray(b) ? a.checked = n.inArray(n(a).val(), b) >= 0 : void 0;
      } }, k.checkOn || (n.valHooks[this].get = function (a) {
      return null === a.getAttribute("value") ? "on" : a.value;
    });
  }), n.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "), function (a, b) {
    n.fn[b] = function (a, c) {
      return arguments.length > 0 ? this.on(b, null, a, c) : this.trigger(b);
    };
  }), n.fn.extend({ hover: function hover(a, b) {
      return this.mouseenter(a).mouseleave(b || a);
    }, bind: function bind(a, b, c) {
      return this.on(a, null, b, c);
    }, unbind: function unbind(a, b) {
      return this.off(a, null, b);
    }, delegate: function delegate(a, b, c, d) {
      return this.on(b, a, c, d);
    }, undelegate: function undelegate(a, b, c) {
      return 1 === arguments.length ? this.off(a, "**") : this.off(b, a || "**", c);
    } });var cb = n.now(),
      db = /\?/;n.parseJSON = function (a) {
    return JSON.parse(a + "");
  }, n.parseXML = function (a) {
    var b, c;if (!a || "string" != typeof a) return null;try {
      c = new DOMParser(), b = c.parseFromString(a, "text/xml");
    } catch (d) {
      b = void 0;
    }return (!b || b.getElementsByTagName("parsererror").length) && n.error("Invalid XML: " + a), b;
  };var eb = /#.*$/,
      fb = /([?&])_=[^&]*/,
      gb = /^(.*?):[ \t]*([^\r\n]*)$/gm,
      hb = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
      ib = /^(?:GET|HEAD)$/,
      jb = /^\/\//,
      kb = /^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,
      lb = {},
      mb = {},
      nb = "*/".concat("*"),
      ob = a.location.href,
      pb = kb.exec(ob.toLowerCase()) || [];function qb(a) {
    return function (b, c) {
      "string" != typeof b && (c = b, b = "*");var d,
          e = 0,
          f = b.toLowerCase().match(E) || [];if (n.isFunction(c)) while (d = f[e++]) {
        "+" === d[0] ? (d = d.slice(1) || "*", (a[d] = a[d] || []).unshift(c)) : (a[d] = a[d] || []).push(c);
      }
    };
  }function rb(a, b, c, d) {
    var e = {},
        f = a === mb;function g(h) {
      var i;return e[h] = !0, n.each(a[h] || [], function (a, h) {
        var j = h(b, c, d);return "string" != typeof j || f || e[j] ? f ? !(i = j) : void 0 : (b.dataTypes.unshift(j), g(j), !1);
      }), i;
    }return g(b.dataTypes[0]) || !e["*"] && g("*");
  }function sb(a, b) {
    var c,
        d,
        e = n.ajaxSettings.flatOptions || {};for (c in b) {
      void 0 !== b[c] && ((e[c] ? a : d || (d = {}))[c] = b[c]);
    }return d && n.extend(!0, a, d), a;
  }function tb(a, b, c) {
    var d,
        e,
        f,
        g,
        h = a.contents,
        i = a.dataTypes;while ("*" === i[0]) {
      i.shift(), void 0 === d && (d = a.mimeType || b.getResponseHeader("Content-Type"));
    }if (d) for (e in h) {
      if (h[e] && h[e].test(d)) {
        i.unshift(e);break;
      }
    }if (i[0] in c) f = i[0];else {
      for (e in c) {
        if (!i[0] || a.converters[e + " " + i[0]]) {
          f = e;break;
        }g || (g = e);
      }f = f || g;
    }return f ? (f !== i[0] && i.unshift(f), c[f]) : void 0;
  }function ub(a, b, c, d) {
    var e,
        f,
        g,
        h,
        i,
        j = {},
        k = a.dataTypes.slice();if (k[1]) for (g in a.converters) {
      j[g.toLowerCase()] = a.converters[g];
    }f = k.shift();while (f) {
      if ((a.responseFields[f] && (c[a.responseFields[f]] = b), !i && d && a.dataFilter && (b = a.dataFilter(b, a.dataType)), i = f, f = k.shift())) if ("*" === f) f = i;else if ("*" !== i && i !== f) {
        if ((g = j[i + " " + f] || j["* " + f], !g)) for (e in j) {
          if ((h = e.split(" "), h[1] === f && (g = j[i + " " + h[0]] || j["* " + h[0]]))) {
            g === !0 ? g = j[e] : j[e] !== !0 && (f = h[0], k.unshift(h[1]));break;
          }
        }if (g !== !0) if (g && a["throws"]) b = g(b);else try {
          b = g(b);
        } catch (l) {
          return { state: "parsererror", error: g ? l : "No conversion from " + i + " to " + f };
        }
      }
    }return { state: "success", data: b };
  }n.extend({ active: 0, lastModified: {}, etag: {}, ajaxSettings: { url: ob, type: "GET", isLocal: hb.test(pb[1]), global: !0, processData: !0, async: !0, contentType: "application/x-www-form-urlencoded; charset=UTF-8", accepts: { "*": nb, text: "text/plain", html: "text/html", xml: "application/xml, text/xml", json: "application/json, text/javascript" }, contents: { xml: /xml/, html: /html/, json: /json/ }, responseFields: { xml: "responseXML", text: "responseText", json: "responseJSON" }, converters: { "* text": String, "text html": !0, "text json": n.parseJSON, "text xml": n.parseXML }, flatOptions: { url: !0, context: !0 } }, ajaxSetup: function ajaxSetup(a, b) {
      return b ? sb(sb(a, n.ajaxSettings), b) : sb(n.ajaxSettings, a);
    }, ajaxPrefilter: qb(lb), ajaxTransport: qb(mb), ajax: function ajax(a, b) {
      "object" == (typeof a === "undefined" ? "undefined" : _typeof(a)) && (b = a, a = void 0), b = b || {};var c,
          d,
          e,
          f,
          g,
          h,
          i,
          j,
          k = n.ajaxSetup({}, b),
          l = k.context || k,
          m = k.context && (l.nodeType || l.jquery) ? n(l) : n.event,
          o = n.Deferred(),
          p = n.Callbacks("once memory"),
          q = k.statusCode || {},
          r = {},
          s = {},
          t = 0,
          u = "canceled",
          v = { readyState: 0, getResponseHeader: function getResponseHeader(a) {
          var b;if (2 === t) {
            if (!f) {
              f = {};while (b = gb.exec(e)) {
                f[b[1].toLowerCase()] = b[2];
              }
            }b = f[a.toLowerCase()];
          }return null == b ? null : b;
        }, getAllResponseHeaders: function getAllResponseHeaders() {
          return 2 === t ? e : null;
        }, setRequestHeader: function setRequestHeader(a, b) {
          var c = a.toLowerCase();return t || (a = s[c] = s[c] || a, r[a] = b), this;
        }, overrideMimeType: function overrideMimeType(a) {
          return t || (k.mimeType = a), this;
        }, statusCode: function statusCode(a) {
          var b;if (a) if (2 > t) for (b in a) {
            q[b] = [q[b], a[b]];
          } else v.always(a[v.status]);return this;
        }, abort: function abort(a) {
          var b = a || u;return c && c.abort(b), x(0, b), this;
        } };if ((o.promise(v).complete = p.add, v.success = v.done, v.error = v.fail, k.url = ((a || k.url || ob) + "").replace(eb, "").replace(jb, pb[1] + "//"), k.type = b.method || b.type || k.method || k.type, k.dataTypes = n.trim(k.dataType || "*").toLowerCase().match(E) || [""], null == k.crossDomain && (h = kb.exec(k.url.toLowerCase()), k.crossDomain = !(!h || h[1] === pb[1] && h[2] === pb[2] && (h[3] || ("http:" === h[1] ? "80" : "443")) === (pb[3] || ("http:" === pb[1] ? "80" : "443")))), k.data && k.processData && "string" != typeof k.data && (k.data = n.param(k.data, k.traditional)), rb(lb, k, b, v), 2 === t)) return v;i = n.event && k.global, i && 0 === n.active++ && n.event.trigger("ajaxStart"), k.type = k.type.toUpperCase(), k.hasContent = !ib.test(k.type), d = k.url, k.hasContent || (k.data && (d = k.url += (db.test(d) ? "&" : "?") + k.data, delete k.data), k.cache === !1 && (k.url = fb.test(d) ? d.replace(fb, "$1_=" + cb++) : d + (db.test(d) ? "&" : "?") + "_=" + cb++)), k.ifModified && (n.lastModified[d] && v.setRequestHeader("If-Modified-Since", n.lastModified[d]), n.etag[d] && v.setRequestHeader("If-None-Match", n.etag[d])), (k.data && k.hasContent && k.contentType !== !1 || b.contentType) && v.setRequestHeader("Content-Type", k.contentType), v.setRequestHeader("Accept", k.dataTypes[0] && k.accepts[k.dataTypes[0]] ? k.accepts[k.dataTypes[0]] + ("*" !== k.dataTypes[0] ? ", " + nb + "; q=0.01" : "") : k.accepts["*"]);for (j in k.headers) {
        v.setRequestHeader(j, k.headers[j]);
      }if (k.beforeSend && (k.beforeSend.call(l, v, k) === !1 || 2 === t)) return v.abort();u = "abort";for (j in { success: 1, error: 1, complete: 1 }) {
        v[j](k[j]);
      }if (c = rb(mb, k, b, v)) {
        v.readyState = 1, i && m.trigger("ajaxSend", [v, k]), k.async && k.timeout > 0 && (g = setTimeout(function () {
          v.abort("timeout");
        }, k.timeout));try {
          t = 1, c.send(r, x);
        } catch (w) {
          if (!(2 > t)) throw w;x(-1, w);
        }
      } else x(-1, "No Transport");function x(a, b, f, h) {
        var j,
            r,
            s,
            u,
            w,
            x = b;2 !== t && (t = 2, g && clearTimeout(g), c = void 0, e = h || "", v.readyState = a > 0 ? 4 : 0, j = a >= 200 && 300 > a || 304 === a, f && (u = tb(k, v, f)), u = ub(k, u, v, j), j ? (k.ifModified && (w = v.getResponseHeader("Last-Modified"), w && (n.lastModified[d] = w), w = v.getResponseHeader("etag"), w && (n.etag[d] = w)), 204 === a || "HEAD" === k.type ? x = "nocontent" : 304 === a ? x = "notmodified" : (x = u.state, r = u.data, s = u.error, j = !s)) : (s = x, (a || !x) && (x = "error", 0 > a && (a = 0))), v.status = a, v.statusText = (b || x) + "", j ? o.resolveWith(l, [r, x, v]) : o.rejectWith(l, [v, x, s]), v.statusCode(q), q = void 0, i && m.trigger(j ? "ajaxSuccess" : "ajaxError", [v, k, j ? r : s]), p.fireWith(l, [v, x]), i && (m.trigger("ajaxComplete", [v, k]), --n.active || n.event.trigger("ajaxStop")));
      }return v;
    }, getJSON: function getJSON(a, b, c) {
      return n.get(a, b, c, "json");
    }, getScript: function getScript(a, b) {
      return n.get(a, void 0, b, "script");
    } }), n.each(["get", "post"], function (a, b) {
    n[b] = function (a, c, d, e) {
      return n.isFunction(c) && (e = e || d, d = c, c = void 0), n.ajax({ url: a, type: b, dataType: e, data: c, success: d });
    };
  }), n._evalUrl = function (a) {
    return n.ajax({ url: a, type: "GET", dataType: "script", async: !1, global: !1, "throws": !0 });
  }, n.fn.extend({ wrapAll: function wrapAll(a) {
      var b;return n.isFunction(a) ? this.each(function (b) {
        n(this).wrapAll(a.call(this, b));
      }) : (this[0] && (b = n(a, this[0].ownerDocument).eq(0).clone(!0), this[0].parentNode && b.insertBefore(this[0]), b.map(function () {
        var a = this;while (a.firstElementChild) {
          a = a.firstElementChild;
        }return a;
      }).append(this)), this);
    }, wrapInner: function wrapInner(a) {
      return this.each(n.isFunction(a) ? function (b) {
        n(this).wrapInner(a.call(this, b));
      } : function () {
        var b = n(this),
            c = b.contents();c.length ? c.wrapAll(a) : b.append(a);
      });
    }, wrap: function wrap(a) {
      var b = n.isFunction(a);return this.each(function (c) {
        n(this).wrapAll(b ? a.call(this, c) : a);
      });
    }, unwrap: function unwrap() {
      return this.parent().each(function () {
        n.nodeName(this, "body") || n(this).replaceWith(this.childNodes);
      }).end();
    } }), n.expr.filters.hidden = function (a) {
    return a.offsetWidth <= 0 && a.offsetHeight <= 0;
  }, n.expr.filters.visible = function (a) {
    return !n.expr.filters.hidden(a);
  };var vb = /%20/g,
      wb = /\[\]$/,
      xb = /\r?\n/g,
      yb = /^(?:submit|button|image|reset|file)$/i,
      zb = /^(?:input|select|textarea|keygen)/i;function Ab(a, b, c, d) {
    var e;if (n.isArray(b)) n.each(b, function (b, e) {
      c || wb.test(a) ? d(a, e) : Ab(a + "[" + ("object" == (typeof e === "undefined" ? "undefined" : _typeof(e)) ? b : "") + "]", e, c, d);
    });else if (c || "object" !== n.type(b)) d(a, b);else for (e in b) {
      Ab(a + "[" + e + "]", b[e], c, d);
    }
  }n.param = function (a, b) {
    var c,
        d = [],
        e = function e(a, b) {
      b = n.isFunction(b) ? b() : null == b ? "" : b, d[d.length] = encodeURIComponent(a) + "=" + encodeURIComponent(b);
    };if ((void 0 === b && (b = n.ajaxSettings && n.ajaxSettings.traditional), n.isArray(a) || a.jquery && !n.isPlainObject(a))) n.each(a, function () {
      e(this.name, this.value);
    });else for (c in a) {
      Ab(c, a[c], b, e);
    }return d.join("&").replace(vb, "+");
  }, n.fn.extend({ serialize: function serialize() {
      return n.param(this.serializeArray());
    }, serializeArray: function serializeArray() {
      return this.map(function () {
        var a = n.prop(this, "elements");return a ? n.makeArray(a) : this;
      }).filter(function () {
        var a = this.type;return this.name && !n(this).is(":disabled") && zb.test(this.nodeName) && !yb.test(a) && (this.checked || !T.test(a));
      }).map(function (a, b) {
        var c = n(this).val();return null == c ? null : n.isArray(c) ? n.map(c, function (a) {
          return { name: b.name, value: a.replace(xb, "\r\n") };
        }) : { name: b.name, value: c.replace(xb, "\r\n") };
      }).get();
    } }), n.ajaxSettings.xhr = function () {
    try {
      return new XMLHttpRequest();
    } catch (a) {}
  };var Bb = 0,
      Cb = {},
      Db = { 0: 200, 1223: 204 },
      Eb = n.ajaxSettings.xhr();a.attachEvent && a.attachEvent("onunload", function () {
    for (var a in Cb) {
      Cb[a]();
    }
  }), k.cors = !!Eb && "withCredentials" in Eb, k.ajax = Eb = !!Eb, n.ajaxTransport(function (a) {
    var b;return k.cors || Eb && !a.crossDomain ? { send: function send(c, d) {
        var e,
            f = a.xhr(),
            g = ++Bb;if ((f.open(a.type, a.url, a.async, a.username, a.password), a.xhrFields)) for (e in a.xhrFields) {
          f[e] = a.xhrFields[e];
        }a.mimeType && f.overrideMimeType && f.overrideMimeType(a.mimeType), a.crossDomain || c["X-Requested-With"] || (c["X-Requested-With"] = "XMLHttpRequest");for (e in c) {
          f.setRequestHeader(e, c[e]);
        }b = function (a) {
          return function () {
            b && (delete Cb[g], b = f.onload = f.onerror = null, "abort" === a ? f.abort() : "error" === a ? d(f.status, f.statusText) : d(Db[f.status] || f.status, f.statusText, "string" == typeof f.responseText ? { text: f.responseText } : void 0, f.getAllResponseHeaders()));
          };
        }, f.onload = b(), f.onerror = b("error"), b = Cb[g] = b("abort");try {
          f.send(a.hasContent && a.data || null);
        } catch (h) {
          if (b) throw h;
        }
      }, abort: function abort() {
        b && b();
      } } : void 0;
  }), n.ajaxSetup({ accepts: { script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript" }, contents: { script: /(?:java|ecma)script/ }, converters: { "text script": function textScript(a) {
        return n.globalEval(a), a;
      } } }), n.ajaxPrefilter("script", function (a) {
    void 0 === a.cache && (a.cache = !1), a.crossDomain && (a.type = "GET");
  }), n.ajaxTransport("script", function (a) {
    if (a.crossDomain) {
      var b, c;return { send: function send(d, e) {
          b = n("<script>").prop({ async: !0, charset: a.scriptCharset, src: a.url }).on("load error", c = function (a) {
            b.remove(), c = null, a && e("error" === a.type ? 404 : 200, a.type);
          }), l.head.appendChild(b[0]);
        }, abort: function abort() {
          c && c();
        } };
    }
  });var Fb = [],
      Gb = /(=)\?(?=&|$)|\?\?/;n.ajaxSetup({ jsonp: "callback", jsonpCallback: function jsonpCallback() {
      var a = Fb.pop() || n.expando + "_" + cb++;return this[a] = !0, a;
    } }), n.ajaxPrefilter("json jsonp", function (b, c, d) {
    var e,
        f,
        g,
        h = b.jsonp !== !1 && (Gb.test(b.url) ? "url" : "string" == typeof b.data && !(b.contentType || "").indexOf("application/x-www-form-urlencoded") && Gb.test(b.data) && "data");return h || "jsonp" === b.dataTypes[0] ? (e = b.jsonpCallback = n.isFunction(b.jsonpCallback) ? b.jsonpCallback() : b.jsonpCallback, h ? b[h] = b[h].replace(Gb, "$1" + e) : b.jsonp !== !1 && (b.url += (db.test(b.url) ? "&" : "?") + b.jsonp + "=" + e), b.converters["script json"] = function () {
      return g || n.error(e + " was not called"), g[0];
    }, b.dataTypes[0] = "json", f = a[e], a[e] = function () {
      g = arguments;
    }, d.always(function () {
      a[e] = f, b[e] && (b.jsonpCallback = c.jsonpCallback, Fb.push(e)), g && n.isFunction(f) && f(g[0]), g = f = void 0;
    }), "script") : void 0;
  }), n.parseHTML = function (a, b, c) {
    if (!a || "string" != typeof a) return null;"boolean" == typeof b && (c = b, b = !1), b = b || l;var d = v.exec(a),
        e = !c && [];return d ? [b.createElement(d[1])] : (d = n.buildFragment([a], b, e), e && e.length && n(e).remove(), n.merge([], d.childNodes));
  };var Hb = n.fn.load;n.fn.load = function (a, b, c) {
    if ("string" != typeof a && Hb) return Hb.apply(this, arguments);var d,
        e,
        f,
        g = this,
        h = a.indexOf(" ");return h >= 0 && (d = n.trim(a.slice(h)), a = a.slice(0, h)), n.isFunction(b) ? (c = b, b = void 0) : b && "object" == (typeof b === "undefined" ? "undefined" : _typeof(b)) && (e = "POST"), g.length > 0 && n.ajax({ url: a, type: e, dataType: "html", data: b }).done(function (a) {
      f = arguments, g.html(d ? n("<div>").append(n.parseHTML(a)).find(d) : a);
    }).complete(c && function (a, b) {
      g.each(c, f || [a.responseText, b, a]);
    }), this;
  }, n.each(["ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend"], function (a, b) {
    n.fn[b] = function (a) {
      return this.on(b, a);
    };
  }), n.expr.filters.animated = function (a) {
    return n.grep(n.timers, function (b) {
      return a === b.elem;
    }).length;
  };var Ib = a.document.documentElement;function Jb(a) {
    return n.isWindow(a) ? a : 9 === a.nodeType && a.defaultView;
  }n.offset = { setOffset: function setOffset(a, b, c) {
      var d,
          e,
          f,
          g,
          h,
          i,
          j,
          k = n.css(a, "position"),
          l = n(a),
          m = {};"static" === k && (a.style.position = "relative"), h = l.offset(), f = n.css(a, "top"), i = n.css(a, "left"), j = ("absolute" === k || "fixed" === k) && (f + i).indexOf("auto") > -1, j ? (d = l.position(), g = d.top, e = d.left) : (g = parseFloat(f) || 0, e = parseFloat(i) || 0), n.isFunction(b) && (b = b.call(a, c, h)), null != b.top && (m.top = b.top - h.top + g), null != b.left && (m.left = b.left - h.left + e), "using" in b ? b.using.call(a, m) : l.css(m);
    } }, n.fn.extend({ offset: function offset(a) {
      if (arguments.length) return void 0 === a ? this : this.each(function (b) {
        n.offset.setOffset(this, a, b);
      });var b,
          c,
          d = this[0],
          e = { top: 0, left: 0 },
          f = d && d.ownerDocument;if (f) return b = f.documentElement, n.contains(b, d) ? (_typeof(d.getBoundingClientRect) !== U && (e = d.getBoundingClientRect()), c = Jb(f), { top: e.top + c.pageYOffset - b.clientTop, left: e.left + c.pageXOffset - b.clientLeft }) : e;
    }, position: function position() {
      if (this[0]) {
        var a,
            b,
            c = this[0],
            d = { top: 0, left: 0 };return "fixed" === n.css(c, "position") ? b = c.getBoundingClientRect() : (a = this.offsetParent(), b = this.offset(), n.nodeName(a[0], "html") || (d = a.offset()), d.top += n.css(a[0], "borderTopWidth", !0), d.left += n.css(a[0], "borderLeftWidth", !0)), { top: b.top - d.top - n.css(c, "marginTop", !0), left: b.left - d.left - n.css(c, "marginLeft", !0) };
      }
    }, offsetParent: function offsetParent() {
      return this.map(function () {
        var a = this.offsetParent || Ib;while (a && !n.nodeName(a, "html") && "static" === n.css(a, "position")) {
          a = a.offsetParent;
        }return a || Ib;
      });
    } }), n.each({ scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function (b, c) {
    var d = "pageYOffset" === c;n.fn[b] = function (e) {
      return J(this, function (b, e, f) {
        var g = Jb(b);return void 0 === f ? g ? g[c] : b[e] : void (g ? g.scrollTo(d ? a.pageXOffset : f, d ? f : a.pageYOffset) : b[e] = f);
      }, b, e, arguments.length, null);
    };
  }), n.each(["top", "left"], function (a, b) {
    n.cssHooks[b] = ya(k.pixelPosition, function (a, c) {
      return c ? (c = xa(a, b), va.test(c) ? n(a).position()[b] + "px" : c) : void 0;
    });
  }), n.each({ Height: "height", Width: "width" }, function (a, b) {
    n.each({ padding: "inner" + a, content: b, "": "outer" + a }, function (c, d) {
      n.fn[d] = function (d, e) {
        var f = arguments.length && (c || "boolean" != typeof d),
            g = c || (d === !0 || e === !0 ? "margin" : "border");return J(this, function (b, c, d) {
          var e;return n.isWindow(b) ? b.document.documentElement["client" + a] : 9 === b.nodeType ? (e = b.documentElement, Math.max(b.body["scroll" + a], e["scroll" + a], b.body["offset" + a], e["offset" + a], e["client" + a])) : void 0 === d ? n.css(b, c, g) : n.style(b, c, d, g);
        }, b, f ? d : void 0, f, null);
      };
    });
  }), n.fn.size = function () {
    return this.length;
  }, n.fn.andSelf = n.fn.addBack, "function" == typeof define && define.amd && define("jquery", [], function () {
    return n;
  });var Kb = a.jQuery,
      Lb = a.$;return n.noConflict = function (b) {
    return a.$ === n && (a.$ = Lb), b && a.jQuery === n && (a.jQuery = Kb), n;
  }, (typeof b === "undefined" ? "undefined" : _typeof(b)) === U && (a.jQuery = a.$ = n), n;
});
//# sourceMappingURL=jquery.min.map

; browserify_shim__define__module__export__(typeof $ != "undefined" ? $ : window.$);

}).call(global, undefined, undefined, undefined, undefined, function defineExport(ex) { module.exports = ex; });

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],15:[function(require,module,exports){
(function (global){
; var __browserify_shim_require__=require;(function browserifyShim(module, exports, require, define, browserify_shim__define__module__export__) {
"use strict";

function _typeof(obj) { return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj; }

/*!
 * Knockout JavaScript library v3.4.0
 * (c) Steven Sanderson - http://knockoutjs.com/
 * License: MIT (http://www.opensource.org/licenses/mit-license.php)
 */

(function () {
  (function (n) {
    var x = this || (0, eval)("this"),
        u = x.document,
        M = x.navigator,
        v = x.jQuery,
        F = x.JSON;(function (n) {
      "function" === typeof define && define.amd ? define(["exports", "require"], n) : "object" === (typeof exports === "undefined" ? "undefined" : _typeof(exports)) && "object" === (typeof module === "undefined" ? "undefined" : _typeof(module)) ? n(module.exports || exports) : n(x.ko = {});
    })(function (N, O) {
      function J(a, c) {
        return null === a || (typeof a === "undefined" ? "undefined" : _typeof(a)) in T ? a === c : !1;
      }function U(b, c) {
        var d;return function () {
          d || (d = a.a.setTimeout(function () {
            d = n;b();
          }, c));
        };
      }function V(b, c) {
        var d;return function () {
          clearTimeout(d);d = a.a.setTimeout(b, c);
        };
      }function W(a, c) {
        c && c !== I ? "beforeChange" === c ? this.Kb(a) : this.Ha(a, c) : this.Lb(a);
      }function X(a, c) {
        null !== c && c.k && c.k();
      }function Y(a, c) {
        var d = this.Hc,
            e = d[s];e.R || (this.lb && this.Ma[c] ? (d.Pb(c, a, this.Ma[c]), this.Ma[c] = null, --this.lb) : e.r[c] || d.Pb(c, a, e.s ? { ia: a } : d.uc(a)));
      }function K(b, c, d, e) {
        a.d[b] = { init: function init(b, g, k, l, m) {
            var h, r;a.m(function () {
              var q = a.a.c(g()),
                  p = !d !== !q,
                  A = !r;if (A || c || p !== h) A && a.va.Aa() && (r = a.a.ua(a.f.childNodes(b), !0)), p ? (A || a.f.da(b, a.a.ua(r)), a.eb(e ? e(m, q) : m, b)) : a.f.xa(b), h = p;
            }, null, { i: b });return { controlsDescendantBindings: !0 };
          } };
        a.h.ta[b] = !1;a.f.Z[b] = !0;
      }var a = "undefined" !== typeof N ? N : {};a.b = function (b, c) {
        for (var d = b.split("."), e = a, f = 0; f < d.length - 1; f++) {
          e = e[d[f]];
        }e[d[d.length - 1]] = c;
      };a.G = function (a, c, d) {
        a[c] = d;
      };a.version = "3.4.0";a.b("version", a.version);a.options = { deferUpdates: !1, useOnlyNativeEvents: !1 };a.a = (function () {
        function b(a, b) {
          for (var c in a) {
            a.hasOwnProperty(c) && b(c, a[c]);
          }
        }function c(a, b) {
          if (b) for (var c in b) {
            b.hasOwnProperty(c) && (a[c] = b[c]);
          }return a;
        }function d(a, b) {
          a.__proto__ = b;return a;
        }function e(b, c, d, e) {
          var h = b[c].match(r) || [];a.a.q(d.match(r), function (b) {
            a.a.pa(h, b, e);
          });b[c] = h.join(" ");
        }var f = { __proto__: [] } instanceof Array,
            g = "function" === typeof Symbol,
            k = {},
            l = {};k[M && /Firefox\/2/i.test(M.userAgent) ? "KeyboardEvent" : "UIEvents"] = ["keyup", "keydown", "keypress"];k.MouseEvents = "click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave".split(" ");b(k, function (a, b) {
          if (b.length) for (var c = 0, d = b.length; c < d; c++) {
            l[b[c]] = a;
          }
        });var m = { propertychange: !0 },
            h = u && (function () {
          for (var a = 3, b = u.createElement("div"), c = b.getElementsByTagName("i"); b.innerHTML = "\x3c!--[if gt IE " + ++a + "]><i></i><![endif]--\x3e", c[0];) {}return 4 < a ? a : n;
        })(),
            r = /\S+/g;return { cc: ["authenticity_token", /^__RequestVerificationToken(_.*)?$/], q: function q(a, b) {
            for (var c = 0, d = a.length; c < d; c++) {
              b(a[c], c);
            }
          }, o: function o(a, b) {
            if ("function" == typeof Array.prototype.indexOf) return Array.prototype.indexOf.call(a, b);for (var c = 0, d = a.length; c < d; c++) {
              if (a[c] === b) return c;
            }return -1;
          }, Sb: function Sb(a, b, c) {
            for (var d = 0, e = a.length; d < e; d++) {
              if (b.call(c, a[d], d)) return a[d];
            }return null;
          }, La: function La(b, c) {
            var d = a.a.o(b, c);0 < d ? b.splice(d, 1) : 0 === d && b.shift();
          }, Tb: function Tb(b) {
            b = b || [];for (var c = [], d = 0, e = b.length; d < e; d++) {
              0 > a.a.o(c, b[d]) && c.push(b[d]);
            }return c;
          }, fb: function fb(a, b) {
            a = a || [];for (var c = [], d = 0, e = a.length; d < e; d++) {
              c.push(b(a[d], d));
            }return c;
          }, Ka: function Ka(a, b) {
            a = a || [];for (var c = [], d = 0, e = a.length; d < e; d++) {
              b(a[d], d) && c.push(a[d]);
            }return c;
          }, ra: function ra(a, b) {
            if (b instanceof Array) a.push.apply(a, b);else for (var c = 0, d = b.length; c < d; c++) {
              a.push(b[c]);
            }return a;
          }, pa: function pa(b, c, d) {
            var e = a.a.o(a.a.zb(b), c);0 > e ? d && b.push(c) : d || b.splice(e, 1);
          }, ka: f, extend: c, Xa: d, Ya: f ? d : c, D: b, Ca: function Ca(a, b) {
            if (!a) return a;var c = {},
                d;for (d in a) {
              a.hasOwnProperty(d) && (c[d] = b(a[d], d, a));
            }return c;
          }, ob: function ob(b) {
            for (; b.firstChild;) {
              a.removeNode(b.firstChild);
            }
          }, jc: function jc(b) {
            b = a.a.V(b);for (var c = (b[0] && b[0].ownerDocument || u).createElement("div"), d = 0, e = b.length; d < e; d++) {
              c.appendChild(a.$(b[d]));
            }return c;
          }, ua: function ua(b, c) {
            for (var d = 0, e = b.length, h = []; d < e; d++) {
              var m = b[d].cloneNode(!0);h.push(c ? a.$(m) : m);
            }return h;
          },
          da: function da(b, c) {
            a.a.ob(b);if (c) for (var d = 0, e = c.length; d < e; d++) {
              b.appendChild(c[d]);
            }
          }, qc: function qc(b, c) {
            var d = b.nodeType ? [b] : b;if (0 < d.length) {
              for (var e = d[0], h = e.parentNode, m = 0, l = c.length; m < l; m++) {
                h.insertBefore(c[m], e);
              }m = 0;for (l = d.length; m < l; m++) {
                a.removeNode(d[m]);
              }
            }
          }, za: function za(a, b) {
            if (a.length) {
              for (b = 8 === b.nodeType && b.parentNode || b; a.length && a[0].parentNode !== b;) {
                a.splice(0, 1);
              }for (; 1 < a.length && a[a.length - 1].parentNode !== b;) {
                a.length--;
              }if (1 < a.length) {
                var c = a[0],
                    d = a[a.length - 1];for (a.length = 0; c !== d;) {
                  a.push(c), c = c.nextSibling;
                }a.push(d);
              }
            }return a;
          }, sc: function sc(a, b) {
            7 > h ? a.setAttribute("selected", b) : a.selected = b;
          }, $a: function $a(a) {
            return null === a || a === n ? "" : a.trim ? a.trim() : a.toString().replace(/^[\s\xa0]+|[\s\xa0]+$/g, "");
          }, nd: function nd(a, b) {
            a = a || "";return b.length > a.length ? !1 : a.substring(0, b.length) === b;
          }, Mc: function Mc(a, b) {
            if (a === b) return !0;if (11 === a.nodeType) return !1;if (b.contains) return b.contains(3 === a.nodeType ? a.parentNode : a);if (b.compareDocumentPosition) return 16 == (b.compareDocumentPosition(a) & 16);for (; a && a != b;) {
              a = a.parentNode;
            }return !!a;
          }, nb: function nb(b) {
            return a.a.Mc(b, b.ownerDocument.documentElement);
          }, Qb: function Qb(b) {
            return !!a.a.Sb(b, a.a.nb);
          }, A: function A(a) {
            return a && a.tagName && a.tagName.toLowerCase();
          }, Wb: function Wb(b) {
            return a.onError ? function () {
              try {
                return b.apply(this, arguments);
              } catch (c) {
                throw (a.onError && a.onError(c), c);
              }
            } : b;
          }, setTimeout: (function (_setTimeout) {
            function setTimeout(_x, _x2) {
              return _setTimeout.apply(this, arguments);
            }

            setTimeout.toString = function () {
              return _setTimeout.toString();
            };

            return setTimeout;
          })(function (b, c) {
            return setTimeout(a.a.Wb(b), c);
          }), $b: function $b(b) {
            setTimeout(function () {
              a.onError && a.onError(b);throw b;
            }, 0);
          }, p: function p(b, c, d) {
            var e = a.a.Wb(d);d = h && m[c];if (a.options.useOnlyNativeEvents || d || !v) {
              if (d || "function" != typeof b.addEventListener) {
                if ("undefined" != typeof b.attachEvent) {
                  var l = function l(a) {
                    e.call(b, a);
                  },
                      f = "on" + c;b.attachEvent(f, l);a.a.F.oa(b, function () {
                    b.detachEvent(f, l);
                  });
                } else throw Error("Browser doesn't support addEventListener or attachEvent");
              } else b.addEventListener(c, e, !1);
            } else v(b).bind(c, e);
          }, Da: function Da(b, c) {
            if (!b || !b.nodeType) throw Error("element must be a DOM node when calling triggerEvent");var d;"input" === a.a.A(b) && b.type && "click" == c.toLowerCase() ? (d = b.type, d = "checkbox" == d || "radio" == d) : d = !1;if (a.options.useOnlyNativeEvents || !v || d) {
              if ("function" == typeof u.createEvent) {
                if ("function" == typeof b.dispatchEvent) d = u.createEvent(l[c] || "HTMLEvents"), d.initEvent(c, !0, !0, x, 0, 0, 0, 0, 0, !1, !1, !1, !1, 0, b), b.dispatchEvent(d);else throw Error("The supplied element doesn't support dispatchEvent");
              } else if (d && b.click) b.click();else if ("undefined" != typeof b.fireEvent) b.fireEvent("on" + c);else throw Error("Browser doesn't support triggering events");
            } else v(b).trigger(c);
          }, c: function c(b) {
            return a.H(b) ? b() : b;
          }, zb: function zb(b) {
            return a.H(b) ? b.t() : b;
          }, bb: function bb(b, c, d) {
            var h;c && ("object" === _typeof(b.classList) ? (h = b.classList[d ? "add" : "remove"], a.a.q(c.match(r), function (a) {
              h.call(b.classList, a);
            })) : "string" === typeof b.className.baseVal ? e(b.className, "baseVal", c, d) : e(b, "className", c, d));
          }, Za: function Za(b, c) {
            var d = a.a.c(c);if (null === d || d === n) d = "";var e = a.f.firstChild(b);!e || 3 != e.nodeType || a.f.nextSibling(e) ? a.f.da(b, [b.ownerDocument.createTextNode(d)]) : e.data = d;a.a.Rc(b);
          }, rc: function rc(a, b) {
            a.name = b;if (7 >= h) try {
              a.mergeAttributes(u.createElement("<input name='" + a.name + "'/>"), !1);
            } catch (c) {}
          }, Rc: function Rc(a) {
            9 <= h && (a = 1 == a.nodeType ? a : a.parentNode, a.style && (a.style.zoom = a.style.zoom));
          }, Nc: function Nc(a) {
            if (h) {
              var b = a.style.width;a.style.width = 0;a.style.width = b;
            }
          }, hd: function hd(b, c) {
            b = a.a.c(b);c = a.a.c(c);for (var d = [], e = b; e <= c; e++) {
              d.push(e);
            }return d;
          }, V: function V(a) {
            for (var b = [], c = 0, d = a.length; c < d; c++) {
              b.push(a[c]);
            }return b;
          }, Yb: function Yb(a) {
            return g ? Symbol(a) : a;
          }, rd: 6 === h, sd: 7 === h, C: h, ec: function ec(b, c) {
            for (var d = a.a.V(b.getElementsByTagName("input")).concat(a.a.V(b.getElementsByTagName("textarea"))), e = "string" == typeof c ? function (a) {
              return a.name === c;
            } : function (a) {
              return c.test(a.name);
            }, h = [], m = d.length - 1; 0 <= m; m--) {
              e(d[m]) && h.push(d[m]);
            }return h;
          }, ed: function ed(b) {
            return "string" == typeof b && (b = a.a.$a(b)) ? F && F.parse ? F.parse(b) : new Function("return " + b)() : null;
          }, Eb: function Eb(b, c, d) {
            if (!F || !F.stringify) throw Error("Cannot find JSON.stringify(). Some browsers (e.g., IE < 8) don't support it natively, but you can overcome this by adding a script reference to json2.js, downloadable from http://www.json.org/json2.js");
            return F.stringify(a.a.c(b), c, d);
          }, fd: function fd(c, d, e) {
            e = e || {};var h = e.params || {},
                m = e.includeFields || this.cc,
                l = c;if ("object" == (typeof c === "undefined" ? "undefined" : _typeof(c)) && "form" === a.a.A(c)) for (var l = c.action, f = m.length - 1; 0 <= f; f--) {
              for (var g = a.a.ec(c, m[f]), k = g.length - 1; 0 <= k; k--) {
                h[g[k].name] = g[k].value;
              }
            }d = a.a.c(d);var r = u.createElement("form");r.style.display = "none";r.action = l;r.method = "post";for (var n in d) {
              c = u.createElement("input"), c.type = "hidden", c.name = n, c.value = a.a.Eb(a.a.c(d[n])), r.appendChild(c);
            }b(h, function (a, b) {
              var c = u.createElement("input");
              c.type = "hidden";c.name = a;c.value = b;r.appendChild(c);
            });u.body.appendChild(r);e.submitter ? e.submitter(r) : r.submit();setTimeout(function () {
              r.parentNode.removeChild(r);
            }, 0);
          } };
      })();a.b("utils", a.a);a.b("utils.arrayForEach", a.a.q);a.b("utils.arrayFirst", a.a.Sb);a.b("utils.arrayFilter", a.a.Ka);a.b("utils.arrayGetDistinctValues", a.a.Tb);a.b("utils.arrayIndexOf", a.a.o);a.b("utils.arrayMap", a.a.fb);a.b("utils.arrayPushAll", a.a.ra);a.b("utils.arrayRemoveItem", a.a.La);a.b("utils.extend", a.a.extend);a.b("utils.fieldsIncludedWithJsonPost", a.a.cc);a.b("utils.getFormFields", a.a.ec);a.b("utils.peekObservable", a.a.zb);a.b("utils.postJson", a.a.fd);a.b("utils.parseJson", a.a.ed);a.b("utils.registerEventHandler", a.a.p);a.b("utils.stringifyJson", a.a.Eb);a.b("utils.range", a.a.hd);a.b("utils.toggleDomNodeCssClass", a.a.bb);a.b("utils.triggerEvent", a.a.Da);a.b("utils.unwrapObservable", a.a.c);a.b("utils.objectForEach", a.a.D);a.b("utils.addOrRemoveItem", a.a.pa);a.b("utils.setTextContent", a.a.Za);a.b("unwrap", a.a.c);Function.prototype.bind || (Function.prototype.bind = function (a) {
        var c = this;if (1 === arguments.length) return function () {
          return c.apply(a, arguments);
        };var d = Array.prototype.slice.call(arguments, 1);return function () {
          var e = d.slice(0);e.push.apply(e, arguments);return c.apply(a, e);
        };
      });a.a.e = new (function () {
        function a(b, g) {
          var k = b[d];if (!k || "null" === k || !e[k]) {
            if (!g) return n;k = b[d] = "ko" + c++;e[k] = {};
          }return e[k];
        }var c = 0,
            d = "__ko__" + new Date().getTime(),
            e = {};return { get: function get(c, d) {
            var e = a(c, !1);return e === n ? n : e[d];
          }, set: function set(c, d, e) {
            if (e !== n || a(c, !1) !== n) a(c, !0)[d] = e;
          }, clear: function clear(a) {
            var b = a[d];return b ? (delete e[b], a[d] = null, !0) : !1;
          }, I: function I() {
            return c++ + d;
          } };
      })();a.b("utils.domData", a.a.e);a.b("utils.domData.clear", a.a.e.clear);a.a.F = new (function () {
        function b(b, c) {
          var e = a.a.e.get(b, d);e === n && c && (e = [], a.a.e.set(b, d, e));return e;
        }function c(d) {
          var e = b(d, !1);if (e) for (var e = e.slice(0), l = 0; l < e.length; l++) {
            e[l](d);
          }a.a.e.clear(d);a.a.F.cleanExternalData(d);if (f[d.nodeType]) for (e = d.firstChild; d = e;) {
            e = d.nextSibling, 8 === d.nodeType && c(d);
          }
        }var d = a.a.e.I(),
            e = { 1: !0, 8: !0, 9: !0 },
            f = { 1: !0, 9: !0 };return { oa: function oa(a, c) {
            if ("function" != typeof c) throw Error("Callback must be a function");b(a, !0).push(c);
          }, pc: function pc(c, e) {
            var l = b(c, !1);l && (a.a.La(l, e), 0 == l.length && a.a.e.set(c, d, n));
          }, $: function $(b) {
            if (e[b.nodeType] && (c(b), f[b.nodeType])) {
              var d = [];a.a.ra(d, b.getElementsByTagName("*"));for (var l = 0, m = d.length; l < m; l++) {
                c(d[l]);
              }
            }return b;
          }, removeNode: function removeNode(b) {
            a.$(b);b.parentNode && b.parentNode.removeChild(b);
          }, cleanExternalData: function cleanExternalData(a) {
            v && "function" == typeof v.cleanData && v.cleanData([a]);
          } };
      })();
      a.$ = a.a.F.$;a.removeNode = a.a.F.removeNode;a.b("cleanNode", a.$);a.b("removeNode", a.removeNode);a.b("utils.domNodeDisposal", a.a.F);a.b("utils.domNodeDisposal.addDisposeCallback", a.a.F.oa);a.b("utils.domNodeDisposal.removeDisposeCallback", a.a.F.pc);(function () {
        var b = [0, "", ""],
            c = [1, "<table>", "</table>"],
            d = [3, "<table><tbody><tr>", "</tr></tbody></table>"],
            e = [1, "<select multiple='multiple'>", "</select>"],
            f = { thead: c, tbody: c, tfoot: c, tr: [2, "<table><tbody>", "</tbody></table>"], td: d, th: d, option: e, optgroup: e },
            g = 8 >= a.a.C;a.a.ma = function (c, d) {
          var e;if (v) {
            if (v.parseHTML) e = v.parseHTML(c, d) || [];else {
              if ((e = v.clean([c], d)) && e[0]) {
                for (var h = e[0]; h.parentNode && 11 !== h.parentNode.nodeType;) {
                  h = h.parentNode;
                }h.parentNode && h.parentNode.removeChild(h);
              }
            }
          } else {
            (e = d) || (e = u);var h = e.parentWindow || e.defaultView || x,
                r = a.a.$a(c).toLowerCase(),
                q = e.createElement("div"),
                p;p = (r = r.match(/^<([a-z]+)[ >]/)) && f[r[1]] || b;r = p[0];p = "ignored<div>" + p[1] + c + p[2] + "</div>";"function" == typeof h.innerShiv ? q.appendChild(h.innerShiv(p)) : (g && e.appendChild(q), q.innerHTML = p, g && q.parentNode.removeChild(q));for (; r--;) {
              q = q.lastChild;
            }e = a.a.V(q.lastChild.childNodes);
          }return e;
        };a.a.Cb = function (b, c) {
          a.a.ob(b);c = a.a.c(c);if (null !== c && c !== n) if (("string" != typeof c && (c = c.toString()), v)) v(b).html(c);else for (var d = a.a.ma(c, b.ownerDocument), e = 0; e < d.length; e++) {
            b.appendChild(d[e]);
          }
        };
      })();a.b("utils.parseHtmlFragment", a.a.ma);a.b("utils.setHtml", a.a.Cb);a.M = (function () {
        function b(c, e) {
          if (c) if (8 == c.nodeType) {
            var f = a.M.lc(c.nodeValue);null != f && e.push({ Lc: c, cd: f });
          } else if (1 == c.nodeType) for (var f = 0, g = c.childNodes, k = g.length; f < k; f++) {
            b(g[f], e);
          }
        }var c = {};return { wb: function wb(a) {
            if ("function" != typeof a) throw Error("You can only pass a function to ko.memoization.memoize()");var b = (4294967296 * (1 + Math.random()) | 0).toString(16).substring(1) + (4294967296 * (1 + Math.random()) | 0).toString(16).substring(1);c[b] = a;return "\x3c!--[ko_memo:" + b + "]--\x3e";
          }, xc: function xc(a, b) {
            var f = c[a];if (f === n) throw Error("Couldn't find any memo with ID " + a + ". Perhaps it's already been unmemoized.");try {
              return f.apply(null, b || []), !0;
            } finally {
              delete c[a];
            }
          }, yc: function yc(c, e) {
            var f = [];b(c, f);for (var g = 0, k = f.length; g < k; g++) {
              var l = f[g].Lc,
                  m = [l];e && a.a.ra(m, e);a.M.xc(f[g].cd, m);l.nodeValue = "";l.parentNode && l.parentNode.removeChild(l);
            }
          }, lc: function lc(a) {
            return (a = a.match(/^\[ko_memo\:(.*?)\]$/)) ? a[1] : null;
          } };
      })();a.b("memoization", a.M);a.b("memoization.memoize", a.M.wb);a.b("memoization.unmemoize", a.M.xc);a.b("memoization.parseMemoText", a.M.lc);a.b("memoization.unmemoizeDomNodeAndDescendants", a.M.yc);a.Y = (function () {
        function b() {
          if (e) for (var b = e, c = 0, m; g < e;) {
            if (m = d[g++]) {
              if (g > b) {
                if (5E3 <= ++c) {
                  g = e;a.a.$b(Error("'Too much recursion' after processing " + c + " task groups."));break;
                }b = e;
              }try {
                m();
              } catch (h) {
                a.a.$b(h);
              }
            }
          }
        }function c() {
          b();g = e = d.length = 0;
        }var d = [],
            e = 0,
            f = 1,
            g = 0;return { scheduler: x.MutationObserver ? (function (a) {
            var b = u.createElement("div");new MutationObserver(a).observe(b, { attributes: !0 });return function () {
              b.classList.toggle("foo");
            };
          })(c) : u && "onreadystatechange" in u.createElement("script") ? function (a) {
            var b = u.createElement("script");b.onreadystatechange = function () {
              b.onreadystatechange = null;u.documentElement.removeChild(b);b = null;a();
            };u.documentElement.appendChild(b);
          } : function (a) {
            setTimeout(a, 0);
          }, Wa: function Wa(b) {
            e || a.Y.scheduler(c);d[e++] = b;return f++;
          }, cancel: function cancel(a) {
            a -= f - e;a >= g && a < e && (d[a] = null);
          }, resetForTesting: function resetForTesting() {
            var a = e - g;g = e = d.length = 0;return a;
          }, md: b };
      })();a.b("tasks", a.Y);a.b("tasks.schedule", a.Y.Wa);a.b("tasks.runEarly", a.Y.md);a.ya = { throttle: function throttle(b, c) {
          b.throttleEvaluation = c;var d = null;return a.B({ read: b, write: function write(e) {
              clearTimeout(d);
              d = a.a.setTimeout(function () {
                b(e);
              }, c);
            } });
        }, rateLimit: function rateLimit(a, c) {
          var d, e, f;"number" == typeof c ? d = c : (d = c.timeout, e = c.method);a.cb = !1;f = "notifyWhenChangesStop" == e ? V : U;a.Ta(function (a) {
            return f(a, d);
          });
        }, deferred: function deferred(b, c) {
          if (!0 !== c) throw Error("The 'deferred' extender only accepts the value 'true', because it is not supported to turn deferral off once enabled.");b.cb || (b.cb = !0, b.Ta(function (c) {
            var e;return function () {
              a.Y.cancel(e);e = a.Y.Wa(c);b.notifySubscribers(n, "dirty");
            };
          }));
        }, notify: function notify(a, c) {
          a.equalityComparer = "always" == c ? null : J;
        } };var T = { undefined: 1, "boolean": 1, number: 1, string: 1 };a.b("extenders", a.ya);a.vc = function (b, c, d) {
        this.ia = b;this.gb = c;this.Kc = d;this.R = !1;a.G(this, "dispose", this.k);
      };a.vc.prototype.k = function () {
        this.R = !0;this.Kc();
      };a.J = function () {
        a.a.Ya(this, D);D.rb(this);
      };var I = "change",
          D = { rb: function rb(a) {
          a.K = {};a.Nb = 1;
        }, X: function X(b, c, d) {
          var e = this;d = d || I;var f = new a.vc(e, c ? b.bind(c) : b, function () {
            a.a.La(e.K[d], f);e.Ia && e.Ia(d);
          });e.sa && e.sa(d);e.K[d] || (e.K[d] = []);e.K[d].push(f);return f;
        }, notifySubscribers: function notifySubscribers(b, c) {
          c = c || I;c === I && this.zc();if (this.Pa(c)) try {
            a.l.Ub();for (var d = this.K[c].slice(0), e = 0, f; f = d[e]; ++e) {
              f.R || f.gb(b);
            }
          } finally {
            a.l.end();
          }
        }, Na: function Na() {
          return this.Nb;
        }, Uc: function Uc(a) {
          return this.Na() !== a;
        }, zc: function zc() {
          ++this.Nb;
        }, Ta: function Ta(b) {
          var c = this,
              d = a.H(c),
              e,
              f,
              g;c.Ha || (c.Ha = c.notifySubscribers, c.notifySubscribers = W);var k = b(function () {
            c.Mb = !1;d && g === c && (g = c());e = !1;c.tb(f, g) && c.Ha(f = g);
          });c.Lb = function (a) {
            c.Mb = e = !0;g = a;k();
          };c.Kb = function (a) {
            e || (f = a, c.Ha(a, "beforeChange"));
          };
        }, Pa: function Pa(a) {
          return this.K[a] && this.K[a].length;
        }, Sc: function Sc(b) {
          if (b) return this.K[b] && this.K[b].length || 0;var c = 0;a.a.D(this.K, function (a, b) {
            "dirty" !== a && (c += b.length);
          });return c;
        }, tb: function tb(a, c) {
          return !this.equalityComparer || !this.equalityComparer(a, c);
        }, extend: function extend(b) {
          var c = this;b && a.a.D(b, function (b, e) {
            var f = a.ya[b];"function" == typeof f && (c = f(c, e) || c);
          });return c;
        } };a.G(D, "subscribe", D.X);a.G(D, "extend", D.extend);a.G(D, "getSubscriptionsCount", D.Sc);a.a.ka && a.a.Xa(D, Function.prototype);a.J.fn = D;a.hc = function (a) {
        return null != a && "function" == typeof a.X && "function" == typeof a.notifySubscribers;
      };a.b("subscribable", a.J);a.b("isSubscribable", a.hc);a.va = a.l = (function () {
        function b(a) {
          d.push(e);e = a;
        }function c() {
          e = d.pop();
        }var d = [],
            e,
            f = 0;return { Ub: b, end: c, oc: function oc(b) {
            if (e) {
              if (!a.hc(b)) throw Error("Only subscribable things can act as dependencies");e.gb.call(e.Gc, b, b.Cc || (b.Cc = ++f));
            }
          }, w: function w(a, d, e) {
            try {
              return b(), a.apply(d, e || []);
            } finally {
              c();
            }
          }, Aa: function Aa() {
            if (e) return e.m.Aa();
          }, Sa: function Sa() {
            if (e) return e.Sa;
          } };
      })();a.b("computedContext", a.va);a.b("computedContext.getDependenciesCount", a.va.Aa);a.b("computedContext.isInitial", a.va.Sa);a.b("ignoreDependencies", a.qd = a.l.w);var E = a.a.Yb("_latestValue");a.N = function (b) {
        function c() {
          if (0 < arguments.length) return c.tb(c[E], arguments[0]) && (c.ga(), c[E] = arguments[0], c.fa()), this;a.l.oc(c);return c[E];
        }c[E] = b;a.a.ka || a.a.extend(c, a.J.fn);a.J.fn.rb(c);a.a.Ya(c, B);a.options.deferUpdates && a.ya.deferred(c, !0);return c;
      };var B = { equalityComparer: J, t: function t() {
          return this[E];
        }, fa: function fa() {
          this.notifySubscribers(this[E]);
        },
        ga: function ga() {
          this.notifySubscribers(this[E], "beforeChange");
        } };a.a.ka && a.a.Xa(B, a.J.fn);var H = a.N.gd = "__ko_proto__";B[H] = a.N;a.Oa = function (b, c) {
        return null === b || b === n || b[H] === n ? !1 : b[H] === c ? !0 : a.Oa(b[H], c);
      };a.H = function (b) {
        return a.Oa(b, a.N);
      };a.Ba = function (b) {
        return "function" == typeof b && b[H] === a.N || "function" == typeof b && b[H] === a.B && b.Vc ? !0 : !1;
      };a.b("observable", a.N);a.b("isObservable", a.H);a.b("isWriteableObservable", a.Ba);a.b("isWritableObservable", a.Ba);a.b("observable.fn", B);a.G(B, "peek", B.t);a.G(B, "valueHasMutated", B.fa);a.G(B, "valueWillMutate", B.ga);a.la = function (b) {
        b = b || [];if ("object" != (typeof b === "undefined" ? "undefined" : _typeof(b)) || !("length" in b)) throw Error("The argument passed when initializing an observable array must be an array, or null, or undefined.");b = a.N(b);a.a.Ya(b, a.la.fn);return b.extend({ trackArrayChanges: !0 });
      };a.la.fn = { remove: function remove(b) {
          for (var c = this.t(), d = [], e = "function" != typeof b || a.H(b) ? function (a) {
            return a === b;
          } : b, f = 0; f < c.length; f++) {
            var g = c[f];e(g) && (0 === d.length && this.ga(), d.push(g), c.splice(f, 1), f--);
          }d.length && this.fa();return d;
        }, removeAll: function removeAll(b) {
          if (b === n) {
            var c = this.t(),
                d = c.slice(0);this.ga();c.splice(0, c.length);this.fa();return d;
          }return b ? this.remove(function (c) {
            return 0 <= a.a.o(b, c);
          }) : [];
        }, destroy: function destroy(b) {
          var c = this.t(),
              d = "function" != typeof b || a.H(b) ? function (a) {
            return a === b;
          } : b;this.ga();for (var e = c.length - 1; 0 <= e; e--) {
            d(c[e]) && (c[e]._destroy = !0);
          }this.fa();
        }, destroyAll: function destroyAll(b) {
          return b === n ? this.destroy(function () {
            return !0;
          }) : b ? this.destroy(function (c) {
            return 0 <= a.a.o(b, c);
          }) : [];
        }, indexOf: function indexOf(b) {
          var c = this();return a.a.o(c, b);
        }, replace: function replace(a, c) {
          var d = this.indexOf(a);0 <= d && (this.ga(), this.t()[d] = c, this.fa());
        } };a.a.ka && a.a.Xa(a.la.fn, a.N.fn);a.a.q("pop push reverse shift sort splice unshift".split(" "), function (b) {
        a.la.fn[b] = function () {
          var a = this.t();this.ga();this.Vb(a, b, arguments);var d = a[b].apply(a, arguments);this.fa();return d === a ? this : d;
        };
      });a.a.q(["slice"], function (b) {
        a.la.fn[b] = function () {
          var a = this();return a[b].apply(a, arguments);
        };
      });a.b("observableArray", a.la);a.ya.trackArrayChanges = function (b, c) {
        function d() {
          if (!e) {
            e = !0;var c = b.notifySubscribers;b.notifySubscribers = function (a, b) {
              b && b !== I || ++k;return c.apply(this, arguments);
            };var d = [].concat(b.t() || []);f = null;g = b.X(function (c) {
              c = [].concat(c || []);if (b.Pa("arrayChange")) {
                var e;if (!f || 1 < k) f = a.a.ib(d, c, b.hb);e = f;
              }d = c;f = null;k = 0;e && e.length && b.notifySubscribers(e, "arrayChange");
            });
          }
        }b.hb = {};c && "object" == (typeof c === "undefined" ? "undefined" : _typeof(c)) && a.a.extend(b.hb, c);b.hb.sparse = !0;if (!b.Vb) {
          var e = !1,
              f = null,
              g,
              k = 0,
              l = b.sa,
              m = b.Ia;b.sa = function (a) {
            l && l.call(b, a);"arrayChange" === a && d();
          };
          b.Ia = function (a) {
            m && m.call(b, a);"arrayChange" !== a || b.Pa("arrayChange") || (g.k(), e = !1);
          };b.Vb = function (b, c, d) {
            function m(a, b, c) {
              return l[l.length] = { status: a, value: b, index: c };
            }if (e && !k) {
              var l = [],
                  g = b.length,
                  t = d.length,
                  G = 0;switch (c) {case "push":
                  G = g;case "unshift":
                  for (c = 0; c < t; c++) {
                    m("added", d[c], G + c);
                  }break;case "pop":
                  G = g - 1;case "shift":
                  g && m("deleted", b[G], G);break;case "splice":
                  c = Math.min(Math.max(0, 0 > d[0] ? g + d[0] : d[0]), g);for (var g = 1 === t ? g : Math.min(c + (d[1] || 0), g), t = c + t - 2, G = Math.max(g, t), P = [], n = [], Q = 2; c < G; ++c, ++Q) {
                    c < g && n.push(m("deleted", b[c], c)), c < t && P.push(m("added", d[Q], c));
                  }a.a.dc(n, P);break;default:
                  return;}f = l;
            }
          };
        }
      };var s = a.a.Yb("_state");a.m = a.B = function (b, c, d) {
        function e() {
          if (0 < arguments.length) {
            if ("function" === typeof f) f.apply(g.pb, arguments);else throw Error("Cannot write a value to a ko.computed unless you specify a 'write' option. If you wish to read the current value, don't pass any parameters.");return this;
          }a.l.oc(e);(g.S || g.s && e.Qa()) && e.aa();return g.T;
        }"object" === (typeof b === "undefined" ? "undefined" : _typeof(b)) ? d = b : (d = d || {}, b && (d.read = b));if ("function" != typeof d.read) throw Error("Pass a function that returns the value of the ko.computed");var f = d.write,
            g = { T: n, S: !0, Ra: !1, Fb: !1, R: !1, Va: !1, s: !1, jd: d.read, pb: c || d.owner, i: d.disposeWhenNodeIsRemoved || d.i || null, wa: d.disposeWhen || d.wa, mb: null, r: {}, L: 0, bc: null };e[s] = g;e.Vc = "function" === typeof f;a.a.ka || a.a.extend(e, a.J.fn);a.J.fn.rb(e);a.a.Ya(e, z);d.pure ? (g.Va = !0, g.s = !0, a.a.extend(e, $)) : d.deferEvaluation && a.a.extend(e, aa);a.options.deferUpdates && a.ya.deferred(e, !0);g.i && (g.Fb = !0, g.i.nodeType || (g.i = null));g.s || d.deferEvaluation || e.aa();g.i && e.ba() && a.a.F.oa(g.i, g.mb = function () {
          e.k();
        });return e;
      };var z = { equalityComparer: J, Aa: function Aa() {
          return this[s].L;
        }, Pb: function Pb(a, c, d) {
          if (this[s].Va && c === this) throw Error("A 'pure' computed must not be called recursively");this[s].r[a] = d;d.Ga = this[s].L++;d.na = c.Na();
        }, Qa: function Qa() {
          var a,
              c,
              d = this[s].r;for (a in d) {
            if (d.hasOwnProperty(a) && (c = d[a], c.ia.Uc(c.na))) return !0;
          }
        }, bd: function bd() {
          this.Fa && !this[s].Ra && this.Fa();
        }, ba: function ba() {
          return this[s].S || 0 < this[s].L;
        },
        ld: function ld() {
          this.Mb || this.ac();
        }, uc: function uc(a) {
          if (a.cb && !this[s].i) {
            var c = a.X(this.bd, this, "dirty"),
                d = a.X(this.ld, this);return { ia: a, k: function k() {
                c.k();d.k();
              } };
          }return a.X(this.ac, this);
        }, ac: function ac() {
          var b = this,
              c = b.throttleEvaluation;c && 0 <= c ? (clearTimeout(this[s].bc), this[s].bc = a.a.setTimeout(function () {
            b.aa(!0);
          }, c)) : b.Fa ? b.Fa() : b.aa(!0);
        }, aa: function aa(b) {
          var c = this[s],
              d = c.wa;if (!c.Ra && !c.R) {
            if (c.i && !a.a.nb(c.i) || d && d()) {
              if (!c.Fb) {
                this.k();return;
              }
            } else c.Fb = !1;c.Ra = !0;try {
              this.Qc(b);
            } finally {
              c.Ra = !1;
            }c.L || this.k();
          }
        }, Qc: function Qc(b) {
          var c = this[s],
              d = c.Va ? n : !c.L,
              e = { Hc: this, Ma: c.r, lb: c.L };a.l.Ub({ Gc: e, gb: Y, m: this, Sa: d });c.r = {};c.L = 0;e = this.Pc(c, e);this.tb(c.T, e) && (c.s || this.notifySubscribers(c.T, "beforeChange"), c.T = e, c.s ? this.zc() : b && this.notifySubscribers(c.T));d && this.notifySubscribers(c.T, "awake");
        }, Pc: function Pc(b, c) {
          try {
            var d = b.jd;return b.pb ? d.call(b.pb) : d();
          } finally {
            a.l.end(), c.lb && !b.s && a.a.D(c.Ma, X), b.S = !1;
          }
        }, t: function t() {
          var a = this[s];(a.S && !a.L || a.s && this.Qa()) && this.aa();return a.T;
        }, Ta: function Ta(b) {
          a.J.fn.Ta.call(this, b);this.Fa = function () {
            this.Kb(this[s].T);this[s].S = !0;this.Lb(this);
          };
        }, k: function k() {
          var b = this[s];!b.s && b.r && a.a.D(b.r, function (a, b) {
            b.k && b.k();
          });b.i && b.mb && a.a.F.pc(b.i, b.mb);b.r = null;b.L = 0;b.R = !0;b.S = !1;b.s = !1;b.i = null;
        } },
          $ = { sa: function sa(b) {
          var c = this,
              d = c[s];if (!d.R && d.s && "change" == b) {
            d.s = !1;if (d.S || c.Qa()) d.r = null, d.L = 0, d.S = !0, c.aa();else {
              var e = [];a.a.D(d.r, function (a, b) {
                e[b.Ga] = a;
              });a.a.q(e, function (a, b) {
                var e = d.r[a],
                    l = c.uc(e.ia);l.Ga = b;l.na = e.na;d.r[a] = l;
              });
            }d.R || c.notifySubscribers(d.T, "awake");
          }
        },
        Ia: function Ia(b) {
          var c = this[s];c.R || "change" != b || this.Pa("change") || (a.a.D(c.r, function (a, b) {
            b.k && (c.r[a] = { ia: b.ia, Ga: b.Ga, na: b.na }, b.k());
          }), c.s = !0, this.notifySubscribers(n, "asleep"));
        }, Na: function Na() {
          var b = this[s];b.s && (b.S || this.Qa()) && this.aa();return a.J.fn.Na.call(this);
        } },
          aa = { sa: function sa(a) {
          "change" != a && "beforeChange" != a || this.t();
        } };a.a.ka && a.a.Xa(z, a.J.fn);var R = a.N.gd;a.m[R] = a.N;z[R] = a.m;a.Xc = function (b) {
        return a.Oa(b, a.m);
      };a.Yc = function (b) {
        return a.Oa(b, a.m) && b[s] && b[s].Va;
      };a.b("computed", a.m);
      a.b("dependentObservable", a.m);a.b("isComputed", a.Xc);a.b("isPureComputed", a.Yc);a.b("computed.fn", z);a.G(z, "peek", z.t);a.G(z, "dispose", z.k);a.G(z, "isActive", z.ba);a.G(z, "getDependenciesCount", z.Aa);a.nc = function (b, c) {
        if ("function" === typeof b) return a.m(b, c, { pure: !0 });b = a.a.extend({}, b);b.pure = !0;return a.m(b, c);
      };a.b("pureComputed", a.nc);(function () {
        function b(a, f, g) {
          g = g || new d();a = f(a);if ("object" != (typeof a === "undefined" ? "undefined" : _typeof(a)) || null === a || a === n || a instanceof RegExp || a instanceof Date || a instanceof String || a instanceof Number || a instanceof Boolean) return a;var k = a instanceof Array ? [] : {};g.save(a, k);c(a, function (c) {
            var d = f(a[c]);switch (typeof d === "undefined" ? "undefined" : _typeof(d)) {case "boolean":case "number":case "string":case "function":
                k[c] = d;break;case "object":case "undefined":
                var h = g.get(d);k[c] = h !== n ? h : b(d, f, g);}
          });return k;
        }function c(a, b) {
          if (a instanceof Array) {
            for (var c = 0; c < a.length; c++) {
              b(c);
            }"function" == typeof a.toJSON && b("toJSON");
          } else for (c in a) {
            b(c);
          }
        }function d() {
          this.keys = [];this.Ib = [];
        }a.wc = function (c) {
          if (0 == arguments.length) throw Error("When calling ko.toJS, pass the object you want to convert.");
          return b(c, function (b) {
            for (var c = 0; a.H(b) && 10 > c; c++) {
              b = b();
            }return b;
          });
        };a.toJSON = function (b, c, d) {
          b = a.wc(b);return a.a.Eb(b, c, d);
        };d.prototype = { save: function save(b, c) {
            var d = a.a.o(this.keys, b);0 <= d ? this.Ib[d] = c : (this.keys.push(b), this.Ib.push(c));
          }, get: function get(b) {
            b = a.a.o(this.keys, b);return 0 <= b ? this.Ib[b] : n;
          } };
      })();a.b("toJS", a.wc);a.b("toJSON", a.toJSON);(function () {
        a.j = { u: function u(b) {
            switch (a.a.A(b)) {case "option":
                return !0 === b.__ko__hasDomDataOptionValue__ ? a.a.e.get(b, a.d.options.xb) : 7 >= a.a.C ? b.getAttributeNode("value") && b.getAttributeNode("value").specified ? b.value : b.text : b.value;case "select":
                return 0 <= b.selectedIndex ? a.j.u(b.options[b.selectedIndex]) : n;default:
                return b.value;}
          }, ha: function ha(b, c, d) {
            switch (a.a.A(b)) {case "option":
                switch (typeof c === "undefined" ? "undefined" : _typeof(c)) {case "string":
                    a.a.e.set(b, a.d.options.xb, n);"__ko__hasDomDataOptionValue__" in b && delete b.__ko__hasDomDataOptionValue__;b.value = c;break;default:
                    a.a.e.set(b, a.d.options.xb, c), b.__ko__hasDomDataOptionValue__ = !0, b.value = "number" === typeof c ? c : "";}break;case "select":
                if ("" === c || null === c) c = n;for (var e = -1, f = 0, g = b.options.length, k; f < g; ++f) {
                  if ((k = a.j.u(b.options[f]), k == c || "" == k && c === n)) {
                    e = f;break;
                  }
                }if (d || 0 <= e || c === n && 1 < b.size) b.selectedIndex = e;break;default:
                if (null === c || c === n) c = "";b.value = c;}
          } };
      })();a.b("selectExtensions", a.j);a.b("selectExtensions.readValue", a.j.u);a.b("selectExtensions.writeValue", a.j.ha);a.h = (function () {
        function b(b) {
          b = a.a.$a(b);123 === b.charCodeAt(0) && (b = b.slice(1, -1));var c = [],
              d = b.match(e),
              r,
              k = [],
              p = 0;if (d) {
            d.push(",");for (var A = 0, y; y = d[A]; ++A) {
              var t = y.charCodeAt(0);
              if (44 === t) {
                if (0 >= p) {
                  c.push(r && k.length ? { key: r, value: k.join("") } : { unknown: r || k.join("") });r = p = 0;k = [];continue;
                }
              } else if (58 === t) {
                if (!p && !r && 1 === k.length) {
                  r = k.pop();continue;
                }
              } else 47 === t && A && 1 < y.length ? (t = d[A - 1].match(f)) && !g[t[0]] && (b = b.substr(b.indexOf(y) + 1), d = b.match(e), d.push(","), A = -1, y = "/") : 40 === t || 123 === t || 91 === t ? ++p : 41 === t || 125 === t || 93 === t ? --p : r || k.length || 34 !== t && 39 !== t || (y = y.slice(1, -1));k.push(y);
            }
          }return c;
        }var c = ["true", "false", "null", "undefined"],
            d = /^(?:[$_a-z][$\w]*|(.+)(\.\s*[$_a-z][$\w]*|\[.+\]))$/i,
            e = RegExp("\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|/(?:[^/\\\\]|\\\\.)*/w*|[^\\s:,/][^,\"'{}()/:[\\]]*[^\\s,\"'{}()/:[\\]]|[^\\s]", "g"),
            f = /[\])"'A-Za-z0-9_$]+$/,
            g = { "in": 1, "return": 1, "typeof": 1 },
            k = {};return { ta: [], ea: k, yb: b, Ua: function Ua(e, m) {
            function h(b, e) {
              var m;if (!A) {
                var l = a.getBindingHandler(b);if (l && l.preprocess && !(e = l.preprocess(e, b, h))) return;if (l = k[b]) m = e, 0 <= a.a.o(c, m) ? m = !1 : (l = m.match(d), m = null === l ? !1 : l[1] ? "Object(" + l[1] + ")" + l[2] : m), l = m;l && g.push("'" + b + "':function(_z){" + m + "=_z}");
              }p && (e = "function(){return " + e + " }");f.push("'" + b + "':" + e);
            }m = m || {};var f = [],
                g = [],
                p = m.valueAccessors,
                A = m.bindingParams,
                y = "string" === typeof e ? b(e) : e;a.a.q(y, function (a) {
              h(a.key || a.unknown, a.value);
            });g.length && h("_ko_property_writers", "{" + g.join(",") + " }");return f.join(",");
          }, ad: function ad(a, b) {
            for (var c = 0; c < a.length; c++) {
              if (a[c].key == b) return !0;
            }return !1;
          }, Ea: function Ea(b, c, d, e, f) {
            if (b && a.H(b)) !a.Ba(b) || f && b.t() === e || b(e);else if ((b = c.get("_ko_property_writers")) && b[d]) b[d](e);
          } };
      })();a.b("expressionRewriting", a.h);a.b("expressionRewriting.bindingRewriteValidators", a.h.ta);a.b("expressionRewriting.parseObjectLiteral", a.h.yb);a.b("expressionRewriting.preProcessBindings", a.h.Ua);a.b("expressionRewriting._twoWayBindings", a.h.ea);a.b("jsonExpressionRewriting", a.h);a.b("jsonExpressionRewriting.insertPropertyAccessorsIntoJson", a.h.Ua);(function () {
        function b(a) {
          return 8 == a.nodeType && g.test(f ? a.text : a.nodeValue);
        }function c(a) {
          return 8 == a.nodeType && k.test(f ? a.text : a.nodeValue);
        }function d(a, d) {
          for (var e = a, f = 1, l = []; e = e.nextSibling;) {
            if (c(e) && (f--, 0 === f)) return l;l.push(e);
            b(e) && f++;
          }if (!d) throw Error("Cannot find closing comment tag to match: " + a.nodeValue);return null;
        }function e(a, b) {
          var c = d(a, b);return c ? 0 < c.length ? c[c.length - 1].nextSibling : a.nextSibling : null;
        }var f = u && "\x3c!--test--\x3e" === u.createComment("test").text,
            g = f ? /^\x3c!--\s*ko(?:\s+([\s\S]+))?\s*--\x3e$/ : /^\s*ko(?:\s+([\s\S]+))?\s*$/,
            k = f ? /^\x3c!--\s*\/ko\s*--\x3e$/ : /^\s*\/ko\s*$/,
            l = { ul: !0, ol: !0 };a.f = { Z: {}, childNodes: function childNodes(a) {
            return b(a) ? d(a) : a.childNodes;
          }, xa: function xa(c) {
            if (b(c)) {
              c = a.f.childNodes(c);for (var d = 0, e = c.length; d < e; d++) {
                a.removeNode(c[d]);
              }
            } else a.a.ob(c);
          }, da: function da(c, d) {
            if (b(c)) {
              a.f.xa(c);for (var e = c.nextSibling, f = 0, l = d.length; f < l; f++) {
                e.parentNode.insertBefore(d[f], e);
              }
            } else a.a.da(c, d);
          }, mc: function mc(a, c) {
            b(a) ? a.parentNode.insertBefore(c, a.nextSibling) : a.firstChild ? a.insertBefore(c, a.firstChild) : a.appendChild(c);
          }, gc: function gc(c, d, e) {
            e ? b(c) ? c.parentNode.insertBefore(d, e.nextSibling) : e.nextSibling ? c.insertBefore(d, e.nextSibling) : c.appendChild(d) : a.f.mc(c, d);
          }, firstChild: function firstChild(a) {
            return b(a) ? !a.nextSibling || c(a.nextSibling) ? null : a.nextSibling : a.firstChild;
          }, nextSibling: function nextSibling(a) {
            b(a) && (a = e(a));return a.nextSibling && c(a.nextSibling) ? null : a.nextSibling;
          }, Tc: b, pd: function pd(a) {
            return (a = (f ? a.text : a.nodeValue).match(g)) ? a[1] : null;
          }, kc: function kc(d) {
            if (l[a.a.A(d)]) {
              var h = d.firstChild;if (h) {
                do {
                  if (1 === h.nodeType) {
                    var f;f = h.firstChild;var g = null;if (f) {
                      do {
                        if (g) g.push(f);else if (b(f)) {
                          var k = e(f, !0);k ? f = k : g = [f];
                        } else c(f) && (g = [f]);
                      } while (f = f.nextSibling);
                    }if (f = g) for (g = h.nextSibling, k = 0; k < f.length; k++) {
                      g ? d.insertBefore(f[k], g) : d.appendChild(f[k]);
                    }
                  }
                } while (h = h.nextSibling);
              }
            }
          } };
      })();a.b("virtualElements", a.f);a.b("virtualElements.allowedBindings", a.f.Z);a.b("virtualElements.emptyNode", a.f.xa);a.b("virtualElements.insertAfter", a.f.gc);a.b("virtualElements.prepend", a.f.mc);a.b("virtualElements.setDomNodeChildren", a.f.da);(function () {
        a.Q = function () {
          this.Fc = {};
        };a.a.extend(a.Q.prototype, { nodeHasBindings: function nodeHasBindings(b) {
            switch (b.nodeType) {case 1:
                return null != b.getAttribute("data-bind") || a.g.getComponentNameForNode(b);case 8:
                return a.f.Tc(b);
              default:
                return !1;}
          }, getBindings: function getBindings(b, c) {
            var d = this.getBindingsString(b, c),
                d = d ? this.parseBindingsString(d, c, b) : null;return a.g.Ob(d, b, c, !1);
          }, getBindingAccessors: function getBindingAccessors(b, c) {
            var d = this.getBindingsString(b, c),
                d = d ? this.parseBindingsString(d, c, b, { valueAccessors: !0 }) : null;return a.g.Ob(d, b, c, !0);
          }, getBindingsString: function getBindingsString(b) {
            switch (b.nodeType) {case 1:
                return b.getAttribute("data-bind");case 8:
                return a.f.pd(b);default:
                return null;}
          }, parseBindingsString: function parseBindingsString(b, c, d, e) {
            try {
              var f = this.Fc,
                  g = b + (e && e.valueAccessors || ""),
                  k;if (!(k = f[g])) {
                var l,
                    m = "with($context){with($data||{}){return{" + a.h.Ua(b, e) + "}}}";l = new Function("$context", "$element", m);k = f[g] = l;
              }return k(c, d);
            } catch (h) {
              throw (h.message = "Unable to parse bindings.\nBindings value: " + b + "\nMessage: " + h.message, h);
            }
          } });a.Q.instance = new a.Q();
      })();a.b("bindingProvider", a.Q);(function () {
        function b(a) {
          return function () {
            return a;
          };
        }function c(a) {
          return a();
        }function d(b) {
          return a.a.Ca(a.l.w(b), function (a, c) {
            return function () {
              return b()[c];
            };
          });
        }function e(c, e, h) {
          return "function" === typeof c ? d(c.bind(null, e, h)) : a.a.Ca(c, b);
        }function f(a, b) {
          return d(this.getBindings.bind(this, a, b));
        }function g(b, c, d) {
          var e,
              h = a.f.firstChild(c),
              f = a.Q.instance,
              m = f.preprocessNode;if (m) {
            for (; e = h;) {
              h = a.f.nextSibling(e), m.call(f, e);
            }h = a.f.firstChild(c);
          }for (; e = h;) {
            h = a.f.nextSibling(e), k(b, e, d);
          }
        }function k(b, c, d) {
          var e = !0,
              h = 1 === c.nodeType;h && a.f.kc(c);if (h && d || a.Q.instance.nodeHasBindings(c)) e = m(c, null, b, d).shouldBindDescendants;e && !r[a.a.A(c)] && g(b, c, !h);
        }function l(b) {
          var c = [],
              d = {},
              e = [];a.a.D(b, function Z(h) {
            if (!d[h]) {
              var f = a.getBindingHandler(h);f && (f.after && (e.push(h), a.a.q(f.after, function (c) {
                if (b[c]) {
                  if (-1 !== a.a.o(e, c)) throw Error("Cannot combine the following bindings, because they have a cyclic dependency: " + e.join(", "));Z(c);
                }
              }), e.length--), c.push({ key: h, fc: f }));d[h] = !0;
            }
          });return c;
        }function m(b, d, e, h) {
          var m = a.a.e.get(b, q);if (!d) {
            if (m) throw Error("You cannot apply bindings multiple times to the same element.");a.a.e.set(b, q, !0);
          }!m && h && a.tc(b, e);var g;if (d && "function" !== typeof d) g = d;else {
            var k = a.Q.instance,
                r = k.getBindingAccessors || f,
                p = a.B(function () {
              (g = d ? d(e, b) : r.call(k, b, e)) && e.P && e.P();return g;
            }, null, { i: b });g && p.ba() || (p = null);
          }var u;if (g) {
            var v = p ? function (a) {
              return function () {
                return c(p()[a]);
              };
            } : function (a) {
              return g[a];
            },
                s = function s() {
              return a.a.Ca(p ? p() : g, c);
            };s.get = function (a) {
              return g[a] && c(v(a));
            };s.has = function (a) {
              return a in g;
            };h = l(g);a.a.q(h, function (c) {
              var d = c.fc.init,
                  h = c.fc.update,
                  f = c.key;if (8 === b.nodeType && !a.f.Z[f]) throw Error("The binding '" + f + "' cannot be used with virtual elements");try {
                "function" == typeof d && a.l.w(function () {
                  var a = d(b, v(f), s, e.$data, e);if (a && a.controlsDescendantBindings) {
                    if (u !== n) throw Error("Multiple bindings (" + u + " and " + f + ") are trying to control descendant bindings of the same element. You cannot use these bindings together on the same element.");u = f;
                  }
                }), "function" == typeof h && a.B(function () {
                  h(b, v(f), s, e.$data, e);
                }, null, { i: b });
              } catch (m) {
                throw (m.message = 'Unable to process binding "' + f + ": " + g[f] + '"\nMessage: ' + m.message, m);
              }
            });
          }return { shouldBindDescendants: u === n };
        }function h(b) {
          return b && b instanceof a.U ? b : new a.U(b);
        }
        a.d = {};var r = { script: !0, textarea: !0, template: !0 };a.getBindingHandler = function (b) {
          return a.d[b];
        };a.U = function (b, c, d, e) {
          var h = this,
              f = "function" == typeof b && !a.H(b),
              m,
              g = a.B(function () {
            var m = f ? b() : b,
                l = a.a.c(m);c ? (c.P && c.P(), a.a.extend(h, c), g && (h.P = g)) : (h.$parents = [], h.$root = l, h.ko = a);h.$rawData = m;h.$data = l;d && (h[d] = l);e && e(h, c, l);return h.$data;
          }, null, { wa: function wa() {
              return m && !a.a.Qb(m);
            }, i: !0 });g.ba() && (h.P = g, g.equalityComparer = null, m = [], g.Ac = function (b) {
            m.push(b);a.a.F.oa(b, function (b) {
              a.a.La(m, b);m.length || (g.k(), h.P = g = n);
            });
          });
        };a.U.prototype.createChildContext = function (b, c, d) {
          return new a.U(b, this, c, function (a, b) {
            a.$parentContext = b;a.$parent = b.$data;a.$parents = (b.$parents || []).slice(0);a.$parents.unshift(a.$parent);d && d(a);
          });
        };a.U.prototype.extend = function (b) {
          return new a.U(this.P || this.$data, this, null, function (c, d) {
            c.$rawData = d.$rawData;a.a.extend(c, "function" == typeof b ? b() : b);
          });
        };var q = a.a.e.I(),
            p = a.a.e.I();a.tc = function (b, c) {
          if (2 == arguments.length) a.a.e.set(b, p, c), c.P && c.P.Ac(b);else return a.a.e.get(b, p);
        };a.Ja = function (b, c, d) {
          1 === b.nodeType && a.f.kc(b);return m(b, c, h(d), !0);
        };a.Dc = function (b, c, d) {
          d = h(d);return a.Ja(b, e(c, d, b), d);
        };a.eb = function (a, b) {
          1 !== b.nodeType && 8 !== b.nodeType || g(h(a), b, !0);
        };a.Rb = function (a, b) {
          !v && x.jQuery && (v = x.jQuery);if (b && 1 !== b.nodeType && 8 !== b.nodeType) throw Error("ko.applyBindings: first parameter should be your view model; second parameter should be a DOM node");b = b || x.document.body;k(h(a), b, !0);
        };a.kb = function (b) {
          switch (b.nodeType) {case 1:case 8:
              var c = a.tc(b);if (c) return c;
              if (b.parentNode) return a.kb(b.parentNode);}return n;
        };a.Jc = function (b) {
          return (b = a.kb(b)) ? b.$data : n;
        };a.b("bindingHandlers", a.d);a.b("applyBindings", a.Rb);a.b("applyBindingsToDescendants", a.eb);a.b("applyBindingAccessorsToNode", a.Ja);a.b("applyBindingsToNode", a.Dc);a.b("contextFor", a.kb);a.b("dataFor", a.Jc);
      })();(function (b) {
        function c(c, e) {
          var m = f.hasOwnProperty(c) ? f[c] : b,
              h;m ? m.X(e) : (m = f[c] = new a.J(), m.X(e), d(c, function (b, d) {
            var e = !(!d || !d.synchronous);g[c] = { definition: b, Zc: e };delete f[c];h || e ? m.notifySubscribers(b) : a.Y.Wa(function () {
              m.notifySubscribers(b);
            });
          }), h = !0);
        }function d(a, b) {
          e("getConfig", [a], function (c) {
            c ? e("loadComponent", [a, c], function (a) {
              b(a, c);
            }) : b(null, null);
          });
        }function e(c, d, f, h) {
          h || (h = a.g.loaders.slice(0));var g = h.shift();if (g) {
            var q = g[c];if (q) {
              var p = !1;if (q.apply(g, d.concat(function (a) {
                p ? f(null) : null !== a ? f(a) : e(c, d, f, h);
              })) !== b && (p = !0, !g.suppressLoaderExceptions)) throw Error("Component loaders must supply values by invoking the callback, not by returning values synchronously.");
            } else e(c, d, f, h);
          } else f(null);
        }
        var f = {},
            g = {};a.g = { get: function get(d, e) {
            var f = g.hasOwnProperty(d) ? g[d] : b;f ? f.Zc ? a.l.w(function () {
              e(f.definition);
            }) : a.Y.Wa(function () {
              e(f.definition);
            }) : c(d, e);
          }, Xb: function Xb(a) {
            delete g[a];
          }, Jb: e };a.g.loaders = [];a.b("components", a.g);a.b("components.get", a.g.get);a.b("components.clearCachedDefinition", a.g.Xb);
      })();(function () {
        function b(b, c, d, e) {
          function g() {
            0 === --y && e(k);
          }var k = {},
              y = 2,
              t = d.template;d = d.viewModel;t ? f(c, t, function (c) {
            a.g.Jb("loadTemplate", [b, c], function (a) {
              k.template = a;g();
            });
          }) : g();d ? f(c, d, function (c) {
            a.g.Jb("loadViewModel", [b, c], function (a) {
              k[l] = a;g();
            });
          }) : g();
        }function c(a, b, d) {
          if ("function" === typeof b) d(function (a) {
            return new b(a);
          });else if ("function" === typeof b[l]) d(b[l]);else if ("instance" in b) {
            var e = b.instance;d(function () {
              return e;
            });
          } else "viewModel" in b ? c(a, b.viewModel, d) : a("Unknown viewModel value: " + b);
        }function d(b) {
          switch (a.a.A(b)) {case "script":
              return a.a.ma(b.text);case "textarea":
              return a.a.ma(b.value);case "template":
              if (e(b.content)) return a.a.ua(b.content.childNodes);}return a.a.ua(b.childNodes);
        }function e(a) {
          return x.DocumentFragment ? a instanceof DocumentFragment : a && 11 === a.nodeType;
        }function f(a, b, c) {
          "string" === typeof b.require ? O || x.require ? (O || x.require)([b.require], c) : a("Uses require, but no AMD loader is present") : c(b);
        }function g(a) {
          return function (b) {
            throw Error("Component '" + a + "': " + b);
          };
        }var k = {};a.g.register = function (b, c) {
          if (!c) throw Error("Invalid configuration for " + b);if (a.g.ub(b)) throw Error("Component " + b + " is already registered");k[b] = c;
        };a.g.ub = function (a) {
          return k.hasOwnProperty(a);
        };a.g.od = function (b) {
          delete k[b];
          a.g.Xb(b);
        };a.g.Zb = { getConfig: function getConfig(a, b) {
            b(k.hasOwnProperty(a) ? k[a] : null);
          }, loadComponent: function loadComponent(a, c, d) {
            var e = g(a);f(e, c, function (c) {
              b(a, e, c, d);
            });
          }, loadTemplate: function loadTemplate(b, c, f) {
            b = g(b);if ("string" === typeof c) f(a.a.ma(c));else if (c instanceof Array) f(c);else if (e(c)) f(a.a.V(c.childNodes));else if (c.element) {
              if ((c = c.element, x.HTMLElement ? c instanceof HTMLElement : c && c.tagName && 1 === c.nodeType)) f(d(c));else if ("string" === typeof c) {
                var l = u.getElementById(c);l ? f(d(l)) : b("Cannot find element with ID " + c);
              } else b("Unknown element type: " + c);
            } else b("Unknown template value: " + c);
          }, loadViewModel: function loadViewModel(a, b, d) {
            c(g(a), b, d);
          } };var l = "createViewModel";a.b("components.register", a.g.register);a.b("components.isRegistered", a.g.ub);a.b("components.unregister", a.g.od);a.b("components.defaultLoader", a.g.Zb);a.g.loaders.push(a.g.Zb);a.g.Bc = k;
      })();(function () {
        function b(b, e) {
          var f = b.getAttribute("params");if (f) {
            var f = c.parseBindingsString(f, e, b, { valueAccessors: !0, bindingParams: !0 }),
                f = a.a.Ca(f, function (c) {
              return a.m(c, null, { i: b });
            }),
                g = a.a.Ca(f, function (c) {
              var e = c.t();return c.ba() ? a.m({ read: function read() {
                  return a.a.c(c());
                }, write: a.Ba(e) && function (a) {
                  c()(a);
                }, i: b }) : e;
            });g.hasOwnProperty("$raw") || (g.$raw = f);return g;
          }return { $raw: {} };
        }a.g.getComponentNameForNode = function (b) {
          var c = a.a.A(b);if (a.g.ub(c) && (-1 != c.indexOf("-") || "[object HTMLUnknownElement]" == "" + b || 8 >= a.a.C && b.tagName === c)) return c;
        };a.g.Ob = function (c, e, f, g) {
          if (1 === e.nodeType) {
            var k = a.g.getComponentNameForNode(e);if (k) {
              c = c || {};if (c.component) throw Error('Cannot use the "component" binding on a custom element matching a component');
              var l = { name: k, params: b(e, f) };c.component = g ? function () {
                return l;
              } : l;
            }
          }return c;
        };var c = new a.Q();9 > a.a.C && (a.g.register = (function (a) {
          return function (b) {
            u.createElement(b);return a.apply(this, arguments);
          };
        })(a.g.register), u.createDocumentFragment = (function (b) {
          return function () {
            var c = b(),
                f = a.g.Bc,
                g;for (g in f) {
              f.hasOwnProperty(g) && c.createElement(g);
            }return c;
          };
        })(u.createDocumentFragment));
      })();(function (b) {
        function c(b, c, d) {
          c = c.template;if (!c) throw Error("Component '" + b + "' has no template");b = a.a.ua(c);a.f.da(d, b);
        }
        function d(a, b, c, d) {
          var e = a.createViewModel;return e ? e.call(a, d, { element: b, templateNodes: c }) : d;
        }var e = 0;a.d.component = { init: function init(f, g, k, l, m) {
            function h() {
              var a = r && r.dispose;"function" === typeof a && a.call(r);q = r = null;
            }var r,
                q,
                p = a.a.V(a.f.childNodes(f));a.a.F.oa(f, h);a.m(function () {
              var l = a.a.c(g()),
                  k,
                  t;"string" === typeof l ? k = l : (k = a.a.c(l.name), t = a.a.c(l.params));if (!k) throw Error("No component name specified");var n = q = ++e;a.g.get(k, function (e) {
                if (q === n) {
                  h();if (!e) throw Error("Unknown component '" + k + "'");c(k, e, f);var g = d(e, f, p, t);e = m.createChildContext(g, b, function (a) {
                    a.$component = g;a.$componentTemplateNodes = p;
                  });r = g;a.eb(e, f);
                }
              });
            }, null, { i: f });return { controlsDescendantBindings: !0 };
          } };a.f.Z.component = !0;
      })();var S = { "class": "className", "for": "htmlFor" };a.d.attr = { update: function update(b, c) {
          var d = a.a.c(c()) || {};a.a.D(d, function (c, d) {
            d = a.a.c(d);var g = !1 === d || null === d || d === n;g && b.removeAttribute(c);8 >= a.a.C && c in S ? (c = S[c], g ? b.removeAttribute(c) : b[c] = d) : g || b.setAttribute(c, d.toString());"name" === c && a.a.rc(b, g ? "" : d.toString());
          });
        } };(function () {
        a.d.checked = { after: ["value", "attr"], init: function init(b, c, d) {
            function e() {
              var e = b.checked,
                  f = p ? g() : e;if (!a.va.Sa() && (!l || e)) {
                var m = a.l.w(c);if (h) {
                  var k = r ? m.t() : m;q !== f ? (e && (a.a.pa(k, f, !0), a.a.pa(k, q, !1)), q = f) : a.a.pa(k, f, e);r && a.Ba(m) && m(k);
                } else a.h.Ea(m, d, "checked", f, !0);
              }
            }function f() {
              var d = a.a.c(c());b.checked = h ? 0 <= a.a.o(d, g()) : k ? d : g() === d;
            }var g = a.nc(function () {
              return d.has("checkedValue") ? a.a.c(d.get("checkedValue")) : d.has("value") ? a.a.c(d.get("value")) : b.value;
            }),
                k = "checkbox" == b.type,
                l = "radio" == b.type;if (k || l) {
              var m = c(),
                  h = k && a.a.c(m) instanceof Array,
                  r = !(h && m.push && m.splice),
                  q = h ? g() : n,
                  p = l || h;l && !b.name && a.d.uniqueName.init(b, function () {
                return !0;
              });a.m(e, null, { i: b });a.a.p(b, "click", e);a.m(f, null, { i: b });m = n;
            }
          } };a.h.ea.checked = !0;a.d.checkedValue = { update: function update(b, c) {
            b.value = a.a.c(c());
          } };
      })();a.d.css = { update: function update(b, c) {
          var d = a.a.c(c());null !== d && "object" == (typeof d === "undefined" ? "undefined" : _typeof(d)) ? a.a.D(d, function (c, d) {
            d = a.a.c(d);a.a.bb(b, c, d);
          }) : (d = a.a.$a(String(d || "")), a.a.bb(b, b.__ko__cssValue, !1), b.__ko__cssValue = d, a.a.bb(b, d, !0));
        } };a.d.enable = { update: function update(b, c) {
          var d = a.a.c(c());d && b.disabled ? b.removeAttribute("disabled") : d || b.disabled || (b.disabled = !0);
        } };a.d.disable = { update: function update(b, c) {
          a.d.enable.update(b, function () {
            return !a.a.c(c());
          });
        } };a.d.event = { init: function init(b, c, d, e, f) {
          var g = c() || {};a.a.D(g, function (g) {
            "string" == typeof g && a.a.p(b, g, function (b) {
              var m,
                  h = c()[g];if (h) {
                try {
                  var r = a.a.V(arguments);e = f.$data;r.unshift(e);m = h.apply(e, r);
                } finally {
                  !0 !== m && (b.preventDefault ? b.preventDefault() : b.returnValue = !1);
                }!1 === d.get(g + "Bubble") && (b.cancelBubble = !0, b.stopPropagation && b.stopPropagation());
              }
            });
          });
        } };a.d.foreach = { ic: function ic(b) {
          return function () {
            var c = b(),
                d = a.a.zb(c);if (!d || "number" == typeof d.length) return { foreach: c, templateEngine: a.W.sb };a.a.c(c);return { foreach: d.data, as: d.as, includeDestroyed: d.includeDestroyed, afterAdd: d.afterAdd, beforeRemove: d.beforeRemove, afterRender: d.afterRender, beforeMove: d.beforeMove, afterMove: d.afterMove, templateEngine: a.W.sb };
          };
        }, init: function init(b, c) {
          return a.d.template.init(b, a.d.foreach.ic(c));
        }, update: function update(b, c, d, e, f) {
          return a.d.template.update(b, a.d.foreach.ic(c), d, e, f);
        } };a.h.ta.foreach = !1;a.f.Z.foreach = !0;a.d.hasfocus = { init: function init(b, c, d) {
          function e(e) {
            b.__ko_hasfocusUpdating = !0;var f = b.ownerDocument;if ("activeElement" in f) {
              var g;try {
                g = f.activeElement;
              } catch (h) {
                g = f.body;
              }e = g === b;
            }f = c();a.h.Ea(f, d, "hasfocus", e, !0);b.__ko_hasfocusLastValue = e;b.__ko_hasfocusUpdating = !1;
          }var f = e.bind(null, !0),
              g = e.bind(null, !1);a.a.p(b, "focus", f);a.a.p(b, "focusin", f);a.a.p(b, "blur", g);a.a.p(b, "focusout", g);
        }, update: function update(b, c) {
          var d = !!a.a.c(c());b.__ko_hasfocusUpdating || b.__ko_hasfocusLastValue === d || (d ? b.focus() : b.blur(), !d && b.__ko_hasfocusLastValue && b.ownerDocument.body.focus(), a.l.w(a.a.Da, null, [b, d ? "focusin" : "focusout"]));
        } };a.h.ea.hasfocus = !0;a.d.hasFocus = a.d.hasfocus;a.h.ea.hasFocus = !0;a.d.html = { init: function init() {
          return { controlsDescendantBindings: !0 };
        }, update: function update(b, c) {
          a.a.Cb(b, c());
        } };K("if");K("ifnot", !1, !0);K("with", !0, !1, function (a, c) {
        return a.createChildContext(c);
      });var L = {};
      a.d.options = { init: function init(b) {
          if ("select" !== a.a.A(b)) throw Error("options binding applies only to SELECT elements");for (; 0 < b.length;) {
            b.remove(0);
          }return { controlsDescendantBindings: !0 };
        }, update: function update(b, c, d) {
          function e() {
            return a.a.Ka(b.options, function (a) {
              return a.selected;
            });
          }function f(a, b, c) {
            var d = typeof b === "undefined" ? "undefined" : _typeof(b);return "function" == d ? b(a) : "string" == d ? a[b] : c;
          }function g(c, e) {
            if (A && h) a.j.ha(b, a.a.c(d.get("value")), !0);else if (p.length) {
              var f = 0 <= a.a.o(p, a.j.u(e[0]));a.a.sc(e[0], f);A && !f && a.l.w(a.a.Da, null, [b, "change"]);
            }
          }var k = b.multiple,
              l = 0 != b.length && k ? b.scrollTop : null,
              m = a.a.c(c()),
              h = d.get("valueAllowUnset") && d.has("value"),
              r = d.get("optionsIncludeDestroyed");c = {};var q,
              p = [];h || (k ? p = a.a.fb(e(), a.j.u) : 0 <= b.selectedIndex && p.push(a.j.u(b.options[b.selectedIndex])));m && ("undefined" == typeof m.length && (m = [m]), q = a.a.Ka(m, function (b) {
            return r || b === n || null === b || !a.a.c(b._destroy);
          }), d.has("optionsCaption") && (m = a.a.c(d.get("optionsCaption")), null !== m && m !== n && q.unshift(L)));var A = !1;c.beforeRemove = function (a) {
            b.removeChild(a);
          };
          m = g;d.has("optionsAfterRender") && "function" == typeof d.get("optionsAfterRender") && (m = function (b, c) {
            g(0, c);a.l.w(d.get("optionsAfterRender"), null, [c[0], b !== L ? b : n]);
          });a.a.Bb(b, q, function (c, e, g) {
            g.length && (p = !h && g[0].selected ? [a.j.u(g[0])] : [], A = !0);e = b.ownerDocument.createElement("option");c === L ? (a.a.Za(e, d.get("optionsCaption")), a.j.ha(e, n)) : (g = f(c, d.get("optionsValue"), c), a.j.ha(e, a.a.c(g)), c = f(c, d.get("optionsText"), g), a.a.Za(e, c));return [e];
          }, c, m);a.l.w(function () {
            h ? a.j.ha(b, a.a.c(d.get("value")), !0) : (k ? p.length && e().length < p.length : p.length && 0 <= b.selectedIndex ? a.j.u(b.options[b.selectedIndex]) !== p[0] : p.length || 0 <= b.selectedIndex) && a.a.Da(b, "change");
          });a.a.Nc(b);l && 20 < Math.abs(l - b.scrollTop) && (b.scrollTop = l);
        } };a.d.options.xb = a.a.e.I();a.d.selectedOptions = { after: ["options", "foreach"], init: function init(b, c, d) {
          a.a.p(b, "change", function () {
            var e = c(),
                f = [];a.a.q(b.getElementsByTagName("option"), function (b) {
              b.selected && f.push(a.j.u(b));
            });a.h.Ea(e, d, "selectedOptions", f);
          });
        }, update: function update(b, c) {
          if ("select" != a.a.A(b)) throw Error("values binding applies only to SELECT elements");var d = a.a.c(c()),
              e = b.scrollTop;d && "number" == typeof d.length && a.a.q(b.getElementsByTagName("option"), function (b) {
            var c = 0 <= a.a.o(d, a.j.u(b));b.selected != c && a.a.sc(b, c);
          });b.scrollTop = e;
        } };a.h.ea.selectedOptions = !0;a.d.style = { update: function update(b, c) {
          var d = a.a.c(c() || {});a.a.D(d, function (c, d) {
            d = a.a.c(d);if (null === d || d === n || !1 === d) d = "";b.style[c] = d;
          });
        } };a.d.submit = { init: function init(b, c, d, e, f) {
          if ("function" != typeof c()) throw Error("The value for a submit binding must be a function");
          a.a.p(b, "submit", function (a) {
            var d,
                e = c();try {
              d = e.call(f.$data, b);
            } finally {
              !0 !== d && (a.preventDefault ? a.preventDefault() : a.returnValue = !1);
            }
          });
        } };a.d.text = { init: function init() {
          return { controlsDescendantBindings: !0 };
        }, update: function update(b, c) {
          a.a.Za(b, c());
        } };a.f.Z.text = !0;(function () {
        if (x && x.navigator) var b = function b(a) {
          if (a) return parseFloat(a[1]);
        },
            c = x.opera && x.opera.version && parseInt(x.opera.version()),
            d = x.navigator.userAgent,
            e = b(d.match(/^(?:(?!chrome).)*version\/([^ ]*) safari/i)),
            f = b(d.match(/Firefox\/([^ ]*)/));
        if (10 > a.a.C) var g = a.a.e.I(),
            k = a.a.e.I(),
            l = function l(b) {
          var c = this.activeElement;(c = c && a.a.e.get(c, k)) && c(b);
        },
            m = function m(b, c) {
          var d = b.ownerDocument;a.a.e.get(d, g) || (a.a.e.set(d, g, !0), a.a.p(d, "selectionchange", l));a.a.e.set(b, k, c);
        };a.d.textInput = { init: function init(b, d, g) {
            function l(c, d) {
              a.a.p(b, c, d);
            }function k() {
              var c = a.a.c(d());if (null === c || c === n) c = "";v !== n && c === v ? a.a.setTimeout(k, 4) : b.value !== c && (u = c, b.value = c);
            }function y() {
              s || (v = b.value, s = a.a.setTimeout(t, 4));
            }function t() {
              clearTimeout(s);v = s = n;var c = b.value;u !== c && (u = c, a.h.Ea(d(), g, "textInput", c));
            }var u = b.value,
                s,
                v,
                x = 9 == a.a.C ? y : t;10 > a.a.C ? (l("propertychange", function (a) {
              "value" === a.propertyName && x(a);
            }), 8 == a.a.C && (l("keyup", t), l("keydown", t)), 8 <= a.a.C && (m(b, x), l("dragend", y))) : (l("input", t), 5 > e && "textarea" === a.a.A(b) ? (l("keydown", y), l("paste", y), l("cut", y)) : 11 > c ? l("keydown", y) : 4 > f && (l("DOMAutoComplete", t), l("dragdrop", t), l("drop", t)));l("change", t);a.m(k, null, { i: b });
          } };a.h.ea.textInput = !0;a.d.textinput = { preprocess: function preprocess(a, b, c) {
            c("textInput", a);
          } };
      })();a.d.uniqueName = { init: function init(b, c) {
          if (c()) {
            var d = "ko_unique_" + ++a.d.uniqueName.Ic;a.a.rc(b, d);
          }
        } };a.d.uniqueName.Ic = 0;a.d.value = { after: ["options", "foreach"], init: function init(b, c, d) {
          if ("input" != b.tagName.toLowerCase() || "checkbox" != b.type && "radio" != b.type) {
            var e = ["change"],
                f = d.get("valueUpdate"),
                g = !1,
                k = null;f && ("string" == typeof f && (f = [f]), a.a.ra(e, f), e = a.a.Tb(e));var l = function l() {
              k = null;g = !1;var e = c(),
                  f = a.j.u(b);a.h.Ea(e, d, "value", f);
            };!a.a.C || "input" != b.tagName.toLowerCase() || "text" != b.type || "off" == b.autocomplete || b.form && "off" == b.form.autocomplete || -1 != a.a.o(e, "propertychange") || (a.a.p(b, "propertychange", function () {
              g = !0;
            }), a.a.p(b, "focus", function () {
              g = !1;
            }), a.a.p(b, "blur", function () {
              g && l();
            }));a.a.q(e, function (c) {
              var d = l;a.a.nd(c, "after") && (d = function () {
                k = a.j.u(b);a.a.setTimeout(l, 0);
              }, c = c.substring(5));a.a.p(b, c, d);
            });var m = function m() {
              var e = a.a.c(c()),
                  f = a.j.u(b);if (null !== k && e === k) a.a.setTimeout(m, 0);else if (e !== f) if ("select" === a.a.A(b)) {
                var g = d.get("valueAllowUnset"),
                    f = function f() {
                  a.j.ha(b, e, g);
                };f();g || e === a.j.u(b) ? a.a.setTimeout(f, 0) : a.l.w(a.a.Da, null, [b, "change"]);
              } else a.j.ha(b, e);
            };a.m(m, null, { i: b });
          } else a.Ja(b, { checkedValue: c });
        }, update: function update() {} };a.h.ea.value = !0;a.d.visible = { update: function update(b, c) {
          var d = a.a.c(c()),
              e = "none" != b.style.display;d && !e ? b.style.display = "" : !d && e && (b.style.display = "none");
        } };(function (b) {
        a.d[b] = { init: function init(c, d, e, f, g) {
            return a.d.event.init.call(this, c, function () {
              var a = {};a[b] = d();return a;
            }, e, f, g);
          } };
      })("click");a.O = function () {};a.O.prototype.renderTemplateSource = function () {
        throw Error("Override renderTemplateSource");
      };a.O.prototype.createJavaScriptEvaluatorBlock = function () {
        throw Error("Override createJavaScriptEvaluatorBlock");
      };a.O.prototype.makeTemplateSource = function (b, c) {
        if ("string" == typeof b) {
          c = c || u;var d = c.getElementById(b);if (!d) throw Error("Cannot find template with ID " + b);return new a.v.n(d);
        }if (1 == b.nodeType || 8 == b.nodeType) return new a.v.qa(b);throw Error("Unknown template type: " + b);
      };a.O.prototype.renderTemplate = function (a, c, d, e) {
        a = this.makeTemplateSource(a, e);return this.renderTemplateSource(a, c, d, e);
      };a.O.prototype.isTemplateRewritten = function (a, c) {
        return !1 === this.allowTemplateRewriting ? !0 : this.makeTemplateSource(a, c).data("isRewritten");
      };a.O.prototype.rewriteTemplate = function (a, c, d) {
        a = this.makeTemplateSource(a, d);c = c(a.text());a.text(c);a.data("isRewritten", !0);
      };a.b("templateEngine", a.O);a.Gb = (function () {
        function b(b, c, d, k) {
          b = a.h.yb(b);for (var l = a.h.ta, m = 0; m < b.length; m++) {
            var h = b[m].key;if (l.hasOwnProperty(h)) {
              var r = l[h];if ("function" === typeof r) {
                if (h = r(b[m].value)) throw Error(h);
              } else if (!r) throw Error("This template engine does not support the '" + h + "' binding within its templates");
            }
          }d = "ko.__tr_ambtns(function($context,$element){return(function(){return{ " + a.h.Ua(b, { valueAccessors: !0 }) + " } })()},'" + d.toLowerCase() + "')";return k.createJavaScriptEvaluatorBlock(d) + c;
        }var c = /(<([a-z]+\d*)(?:\s+(?!data-bind\s*=\s*)[a-z0-9\-]+(?:=(?:\"[^\"]*\"|\'[^\']*\'|[^>]*))?)*\s+)data-bind\s*=\s*(["'])([\s\S]*?)\3/gi,
            d = /\x3c!--\s*ko\b\s*([\s\S]*?)\s*--\x3e/g;return { Oc: function Oc(b, c, d) {
            c.isTemplateRewritten(b, d) || c.rewriteTemplate(b, function (b) {
              return a.Gb.dd(b, c);
            }, d);
          }, dd: function dd(a, f) {
            return a.replace(c, function (a, c, d, e, h) {
              return b(h, c, d, f);
            }).replace(d, function (a, c) {
              return b(c, "\x3c!-- ko --\x3e", "#comment", f);
            });
          }, Ec: function Ec(b, c) {
            return a.M.wb(function (d, k) {
              var l = d.nextSibling;l && l.nodeName.toLowerCase() === c && a.Ja(l, b, k);
            });
          } };
      })();a.b("__tr_ambtns", a.Gb.Ec);(function () {
        a.v = {};a.v.n = function (b) {
          if (this.n = b) {
            var c = a.a.A(b);this.ab = "script" === c ? 1 : "textarea" === c ? 2 : "template" == c && b.content && 11 === b.content.nodeType ? 3 : 4;
          }
        };a.v.n.prototype.text = function () {
          var b = 1 === this.ab ? "text" : 2 === this.ab ? "value" : "innerHTML";if (0 == arguments.length) return this.n[b];var c = arguments[0];"innerHTML" === b ? a.a.Cb(this.n, c) : this.n[b] = c;
        };var b = a.a.e.I() + "_";a.v.n.prototype.data = function (c) {
          if (1 === arguments.length) return a.a.e.get(this.n, b + c);a.a.e.set(this.n, b + c, arguments[1]);
        };var c = a.a.e.I();a.v.n.prototype.nodes = function () {
          var b = this.n;if (0 == arguments.length) return (a.a.e.get(b, c) || {}).jb || (3 === this.ab ? b.content : 4 === this.ab ? b : n);a.a.e.set(b, c, { jb: arguments[0] });
        };a.v.qa = function (a) {
          this.n = a;
        };a.v.qa.prototype = new a.v.n();a.v.qa.prototype.text = function () {
          if (0 == arguments.length) {
            var b = a.a.e.get(this.n, c) || {};b.Hb === n && b.jb && (b.Hb = b.jb.innerHTML);return b.Hb;
          }a.a.e.set(this.n, c, { Hb: arguments[0] });
        };a.b("templateSources", a.v);a.b("templateSources.domElement", a.v.n);a.b("templateSources.anonymousTemplate", a.v.qa);
      })();(function () {
        function b(b, c, d) {
          var e;for (c = a.f.nextSibling(c); b && (e = b) !== c;) {
            b = a.f.nextSibling(e), d(e, b);
          }
        }function c(c, d) {
          if (c.length) {
            var e = c[0],
                f = c[c.length - 1],
                g = e.parentNode,
                k = a.Q.instance,
                n = k.preprocessNode;if (n) {
              b(e, f, function (a, b) {
                var c = a.previousSibling,
                    d = n.call(k, a);d && (a === e && (e = d[0] || b), a === f && (f = d[d.length - 1] || c));
              });c.length = 0;if (!e) return;e === f ? c.push(e) : (c.push(e, f), a.a.za(c, g));
            }b(e, f, function (b) {
              1 !== b.nodeType && 8 !== b.nodeType || a.Rb(d, b);
            });b(e, f, function (b) {
              1 !== b.nodeType && 8 !== b.nodeType || a.M.yc(b, [d]);
            });a.a.za(c, g);
          }
        }function d(a) {
          return a.nodeType ? a : 0 < a.length ? a[0] : null;
        }function e(b, e, f, k, q) {
          q = q || {};var p = (b && d(b) || f || {}).ownerDocument,
              n = q.templateEngine || g;a.Gb.Oc(f, n, p);f = n.renderTemplate(f, k, q, p);if ("number" != typeof f.length || 0 < f.length && "number" != typeof f[0].nodeType) throw Error("Template engine must return an array of DOM nodes");p = !1;switch (e) {case "replaceChildren":
              a.f.da(b, f);p = !0;break;case "replaceNode":
              a.a.qc(b, f);p = !0;break;case "ignoreTargetNode":
              break;default:
              throw Error("Unknown renderMode: " + e);}p && (c(f, k), q.afterRender && a.l.w(q.afterRender, null, [f, k.$data]));
          return f;
        }function f(b, c, d) {
          return a.H(b) ? b() : "function" === typeof b ? b(c, d) : b;
        }var g;a.Db = function (b) {
          if (b != n && !(b instanceof a.O)) throw Error("templateEngine must inherit from ko.templateEngine");g = b;
        };a.Ab = function (b, c, h, k, q) {
          h = h || {};if ((h.templateEngine || g) == n) throw Error("Set a template engine before calling renderTemplate");q = q || "replaceChildren";if (k) {
            var p = d(k);return a.B(function () {
              var g = c && c instanceof a.U ? c : new a.U(a.a.c(c)),
                  n = f(b, g.$data, g),
                  g = e(k, q, n, g, h);"replaceNode" == q && (k = g, p = d(k));
            }, null, { wa: function wa() {
                return !p || !a.a.nb(p);
              }, i: p && "replaceNode" == q ? p.parentNode : p });
          }return a.M.wb(function (d) {
            a.Ab(b, c, h, d, "replaceNode");
          });
        };a.kd = function (b, d, g, k, q) {
          function p(a, b) {
            c(b, s);g.afterRender && g.afterRender(b, a);s = null;
          }function u(a, c) {
            s = q.createChildContext(a, g.as, function (a) {
              a.$index = c;
            });var d = f(b, a, s);return e(null, "ignoreTargetNode", d, s, g);
          }var s;return a.B(function () {
            var b = a.a.c(d) || [];"undefined" == typeof b.length && (b = [b]);b = a.a.Ka(b, function (b) {
              return g.includeDestroyed || b === n || null === b || !a.a.c(b._destroy);
            });
            a.l.w(a.a.Bb, null, [k, b, u, g, p]);
          }, null, { i: k });
        };var k = a.a.e.I();a.d.template = { init: function init(b, c) {
            var d = a.a.c(c());if ("string" == typeof d || d.name) a.f.xa(b);else {
              if ("nodes" in d) {
                if ((d = d.nodes || [], a.H(d))) throw Error('The "nodes" option must be a plain, non-observable array.');
              } else d = a.f.childNodes(b);d = a.a.jc(d);new a.v.qa(b).nodes(d);
            }return { controlsDescendantBindings: !0 };
          }, update: function update(b, c, d, e, f) {
            var g = c(),
                s;c = a.a.c(g);d = !0;e = null;"string" == typeof c ? c = {} : (g = c.name, "if" in c && (d = a.a.c(c["if"])), d && "ifnot" in c && (d = !a.a.c(c.ifnot)), s = a.a.c(c.data));"foreach" in c ? e = a.kd(g || b, d && c.foreach || [], c, b, f) : d ? (f = "data" in c ? f.createChildContext(s, c.as) : f, e = a.Ab(g || b, f, c, b)) : a.f.xa(b);f = e;(s = a.a.e.get(b, k)) && "function" == typeof s.k && s.k();a.a.e.set(b, k, f && f.ba() ? f : n);
          } };a.h.ta.template = function (b) {
          b = a.h.yb(b);return 1 == b.length && b[0].unknown || a.h.ad(b, "name") ? null : "This template engine does not support anonymous templates nested within its templates";
        };a.f.Z.template = !0;
      })();a.b("setTemplateEngine", a.Db);a.b("renderTemplate", a.Ab);a.a.dc = function (a, c, d) {
        if (a.length && c.length) {
          var e, f, g, k, l;for (e = f = 0; (!d || e < d) && (k = a[f]); ++f) {
            for (g = 0; l = c[g]; ++g) {
              if (k.value === l.value) {
                k.moved = l.index;l.moved = k.index;c.splice(g, 1);e = g = 0;break;
              }
            }e += g;
          }
        }
      };a.a.ib = (function () {
        function b(b, d, e, f, g) {
          var k = Math.min,
              l = Math.max,
              m = [],
              h,
              n = b.length,
              q,
              p = d.length,
              s = p - n || 1,
              u = n + p + 1,
              t,
              v,
              x;for (h = 0; h <= n; h++) {
            for (v = t, m.push(t = []), x = k(p, h + s), q = l(0, h - 1); q <= x; q++) {
              t[q] = q ? h ? b[h - 1] === d[q - 1] ? v[q - 1] : k(v[q] || u, t[q - 1] || u) + 1 : q + 1 : h + 1;
            }
          }k = [];l = [];s = [];h = n;for (q = p; h || q;) {
            p = m[h][q] - 1, q && p === m[h][q - 1] ? l.push(k[k.length] = { status: e, value: d[--q], index: q }) : h && p === m[h - 1][q] ? s.push(k[k.length] = { status: f, value: b[--h], index: h }) : (--q, --h, g.sparse || k.push({ status: "retained", value: d[q] }));
          }a.a.dc(s, l, !g.dontLimitMoves && 10 * n);return k.reverse();
        }return function (a, d, e) {
          e = "boolean" === typeof e ? { dontLimitMoves: e } : e || {};a = a || [];d = d || [];return a.length < d.length ? b(a, d, "added", "deleted", e) : b(d, a, "deleted", "added", e);
        };
      })();a.b("utils.compareArrays", a.a.ib);(function () {
        function b(b, c, d, k, l) {
          var m = [],
              h = a.B(function () {
            var h = c(d, l, a.a.za(m, b)) || [];0 < m.length && (a.a.qc(m, h), k && a.l.w(k, null, [d, h, l]));m.length = 0;a.a.ra(m, h);
          }, null, { i: b, wa: function wa() {
              return !a.a.Qb(m);
            } });return { ca: m, B: h.ba() ? h : n };
        }var c = a.a.e.I(),
            d = a.a.e.I();a.a.Bb = function (e, f, g, k, l) {
          function m(b, c) {
            w = q[c];v !== c && (D[b] = w);w.qb(v++);a.a.za(w.ca, e);u.push(w);z.push(w);
          }function h(b, c) {
            if (b) for (var d = 0, e = c.length; d < e; d++) {
              c[d] && a.a.q(c[d].ca, function (a) {
                b(a, d, c[d].ja);
              });
            }
          }f = f || [];k = k || {};var r = a.a.e.get(e, c) === n,
              q = a.a.e.get(e, c) || [],
              p = a.a.fb(q, function (a) {
            return a.ja;
          }),
              s = a.a.ib(p, f, k.dontLimitMoves),
              u = [],
              t = 0,
              v = 0,
              x = [],
              z = [];f = [];for (var D = [], p = [], w, C = 0, B, E; B = s[C]; C++) {
            switch ((E = B.moved, B.status)) {case "deleted":
                E === n && (w = q[t], w.B && (w.B.k(), w.B = n), a.a.za(w.ca, e).length && (k.beforeRemove && (u.push(w), z.push(w), w.ja === d ? w = null : f[C] = w), w && x.push.apply(x, w.ca)));t++;break;case "retained":
                m(C, t++);break;case "added":
                E !== n ? m(C, E) : (w = { ja: B.value, qb: a.N(v++) }, u.push(w), z.push(w), r || (p[C] = w));}
          }a.a.e.set(e, c, u);h(k.beforeMove, D);a.a.q(x, k.beforeRemove ? a.$ : a.removeNode);for (var C = 0, r = a.f.firstChild(e), F; w = z[C]; C++) {
            w.ca || a.a.extend(w, b(e, g, w.ja, l, w.qb));for (t = 0; s = w.ca[t]; r = s.nextSibling, F = s, t++) {
              s !== r && a.f.gc(e, s, F);
            }!w.Wc && l && (l(w.ja, w.ca, w.qb), w.Wc = !0);
          }h(k.beforeRemove, f);for (C = 0; C < f.length; ++C) {
            f[C] && (f[C].ja = d);
          }h(k.afterMove, D);h(k.afterAdd, p);
        };
      })();a.b("utils.setDomNodeChildrenFromArrayMapping", a.a.Bb);a.W = function () {
        this.allowTemplateRewriting = !1;
      };a.W.prototype = new a.O();a.W.prototype.renderTemplateSource = function (b, c, d, e) {
        if (c = (9 > a.a.C ? 0 : b.nodes) ? b.nodes() : null) return a.a.V(c.cloneNode(!0).childNodes);b = b.text();return a.a.ma(b, e);
      };a.W.sb = new a.W();a.Db(a.W.sb);a.b("nativeTemplateEngine", a.W);(function () {
        a.vb = function () {
          var a = this.$c = (function () {
            if (!v || !v.tmpl) return 0;try {
              if (0 <= v.tmpl.tag.tmpl.open.toString().indexOf("__")) return 2;
            } catch (a) {}return 1;
          })();this.renderTemplateSource = function (b, e, f, g) {
            g = g || u;f = f || {};if (2 > a) throw Error("Your version of jQuery.tmpl is too old. Please upgrade to jQuery.tmpl 1.0.0pre or later.");var k = b.data("precompiled");
            k || (k = b.text() || "", k = v.template(null, "{{ko_with $item.koBindingContext}}" + k + "{{/ko_with}}"), b.data("precompiled", k));b = [e.$data];e = v.extend({ koBindingContext: e }, f.templateOptions);e = v.tmpl(k, b, e);e.appendTo(g.createElement("div"));v.fragments = {};return e;
          };this.createJavaScriptEvaluatorBlock = function (a) {
            return "{{ko_code ((function() { return " + a + " })()) }}";
          };this.addTemplate = function (a, b) {
            u.write("<script type='text/html' id='" + a + "'>" + b + "\x3c/script>");
          };0 < a && (v.tmpl.tag.ko_code = { open: "__.push($1 || '');" }, v.tmpl.tag.ko_with = { open: "with($1) {", close: "} " });
        };a.vb.prototype = new a.O();var b = new a.vb();0 < b.$c && a.Db(b);a.b("jqueryTmplTemplateEngine", a.vb);
      })();
    });
  })();
})();

; browserify_shim__define__module__export__(typeof ko != "undefined" ? ko : window.ko);

}).call(global, undefined, undefined, undefined, undefined, function defineExport(ex) { module.exports = ex; });

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],16:[function(require,module,exports){
"use strict";

/*! ko-calendar.js v0.2.11 */
!(function (a, b) {
  "function" == typeof define && define.amd ? define(["knockout"], function (c) {
    b.call(a, window, document, c);
  }) : b.call(a, window, document, ko);
})(undefined, function (a, b, c) {
  var d = "calendar",
      e = { deepExtend: function deepExtend(a, b) {
      var c;for (c in b) {
        b[c] && b[c].constructor && b[c].constructor === Object ? (a[c] = a[c] || {}, e.deepExtend(a[c], b[c])) : a[c] = b[c];
      }return a;
    } },
      f = function f(_f) {
    var g = this;return g.opts = { value: c.observable(), current: new Date(), deselectable: !0, showCalendar: !0, showToday: !0, showTime: !0, showNow: !0, militaryTime: !1, min: null, max: null, autoclose: !0, strings: { months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], time: ["AM", "PM"] } }, e.deepExtend(g.opts, _f), g.opts.showCalendar || g.opts.showTime ? (g.constants = { daysInWeek: 7, dayStringLength: 2 }, g.utils = { date: { isValid: function isValid(a) {
          var b = new Date(a);return "[object Date]" !== Object.prototype.toString.call(b) ? !1 : !isNaN(b.getTime());
        }, normalize: function normalize(a) {
          var b = new Date(a.getTime());return b.setHours(0, 0, 0, 0), b;
        }, isSame: function isSame(a, b) {
          return a && b ? a.getMonth() == b.getMonth() && a.getDate() == b.getDate() && a.getFullYear() == b.getFullYear() : !1;
        }, isSameMonth: function isSameMonth(a, b) {
          return a && b ? a.getMonth() == b.getMonth() : !1;
        }, isWeekend: function isWeekend(a) {
          return a ? 0 === a.getDay() || a.getDay() == g.constants.daysInWeek - 1 : !1;
        }, isWithinMinMaxDateRange: function isWithinMinMaxDateRange(a) {
          return a ? g.opts.min || g.opts.max ? g.opts.min && g.utils.date.normalize(g.opts.min) > a ? !1 : g.opts.max && g.utils.date.normalize(g.opts.max) < a ? !1 : !0 : !0 : !1;
        } }, time: { handleSuffixCheck: function handleSuffixCheck(a) {
          var b = a.getHours();return b >= 12 ? b -= 12 : 12 > b && (b += 12), a.setHours(b);
        }, checkMinTimeRange: function checkMinTimeRange(a) {
          if (!a || !g.value() || !g.opts.min && !g.opts.max) return !1;var b = new Date(g.value());return "hours" === a.type ? b.setHours(b.getHours() - 1) : "minutes" === a.type ? b.setMinutes(b.getMinutes() - 1) : "suffix" === a.type && (b = g.utils.time.handleSuffixCheck(b)), g.opts.max && g.opts.max < b ? !0 : g.opts.min && g.opts.min > b ? !0 : !1;
        }, checkMaxTimeRange: function checkMaxTimeRange(a) {
          if (!a || !g.value() || !g.opts.min && !g.opts.max) return !1;var b = new Date(g.value());return "hours" === a.type ? b.setHours(b.getHours() + 1) : "minutes" === a.type ? b.setMinutes(b.getMinutes() + 1) : "suffix" === a.type && (b = new Date(g.utils.time.handleSuffixCheck(b))), g.opts.min && g.opts.min > b ? !0 : g.opts.max && g.opts.max < b ? !0 : !1;
        } }, strings: { pad: function pad(a) {
          return 10 > a ? "0" + a : a;
        } }, element: { offset: function offset(c) {
          var d = c.getBoundingClientRect(),
              e = b.documentElement;return { top: d.top + a.pageYOffset - e.clientTop, left: d.left + a.pageXOffset - e.clientLeft };
        }, height: function height(a) {
          return a.offsetHeight;
        }, isDescendant: function isDescendant(a, b) {
          for (var c = b.parentNode; null !== c;) {
            if (c == a) return !0;c = c.parentNode;
          }return !1;
        } } }, g.current = c.observable(g.opts.current || new Date()), c.isObservable(g.opts.value) ? (g.value = g.opts.value, g.opts.showToday && !g.utils.date.isWithinMinMaxDateRange(g.utils.date.normalize(new Date())) && (g.opts.showToday = !1), g.opts.showNow && (g.opts.min && g.opts.min >= new Date() || g.opts.max && g.opts.max <= new Date()) && (g.opts.showNow = !1), g.calendar = { select: function select(a, b) {
        return g.opts.deselectable && g.utils.date.isSame(g.value(), a) ? g.value(null) : (g.opts.min && g.utils.date.isSame(a, g.opts.min) ? g.value(new Date(g.opts.min)) : g.value(new Date(a)), void (g.input() && g.opts.autoclose && g.visible(!1)));
      }, selectToday: function selectToday(a, b) {
        var c = g.utils.date.normalize(new Date());g.calendar.select(c), g.current(c);
      }, next: function next() {
        var a = g.current();a.setDate(1), a.setMonth(a.getMonth() + 1), g.current(new Date(a));
      }, prev: function prev() {
        var a = g.current();a.setDate(1), a.setMonth(a.getMonth() - 1), g.current(new Date(a));
      }, sheet: c.computed(function () {
        var a = g.utils.date.normalize(g.current());a.setDate(1), a.setDate(a.getDate() - a.getDay());for (var b = [], c = 0, d = !1, e = !1, f = !1;;) {
          if ((b[c] || (b[c] = []), b[c].length !== g.constants.daysInWeek && (b[c].push(new Date(a.getTime())), a.setDate(a.getDate() + 1)), a.getMonth() == g.current().getMonth() && (d = !0), d && a.getMonth() !== g.current().getMonth() && (e = !0), e && b[c].length == g.constants.daysInWeek && (f = !0), e && f)) break;b[c].length == g.constants.daysInWeek && c++;
        }return b;
      }) }, g.time = { next: function next(a, b) {
        return g.value() ? void g.value(new Date(a.set(a.get() + 1))) : g.time.selectNow();
      }, prev: function prev(a, b) {
        return g.value() ? void g.value(new Date(a.set(a.get() - 1))) : g.time.selectNow();
      }, selectNow: function selectNow() {
        var a = new Date();g.value(a), g.current(a), g.input() && g.opts.autoclose && g.visible(!1);
      }, sheet: c.observableArray([{ type: "hours", get: function get() {
          return g.value().getHours();
        }, set: function set(a) {
          return g.value().setHours(a);
        } }, { type: "minutes", get: function get() {
          return g.value().getMinutes();
        }, set: function set(a) {
          return g.value().setMinutes(a);
        } }]), text: function text(a) {
        if (!g.value()) return "-";switch (a.type) {case "suffix":
            return a.get() ? g.opts.strings.time[1] : g.opts.strings.time[0];case "hours":
            var b = a.get();return !g.opts.militaryTime && (b > 12 || 0 === b) && (b -= 12), Math.abs(b);default:
            return g.utils.strings.pad(a.get());}
      } }, g.opts.militaryTime || g.time.sheet.push({ type: "suffix", get: function get() {
        return g.value() && g.value().getHours() < 12 ? 0 : 1;
      }, set: function set(a) {
        var b = g.value().getHours();return b >= 12 ? b -= 12 : 12 > b && (b += 12), g.value().setHours(b);
      } }), g.input = c.observable(!1), void (g.visible = c.observable(!0))) : console.error("value must be an observable")) : console.error("Silly goose, what are you using ko-%s for?", d);
  },
      g = '<div class="ko-calendar" data-bind="with: $data, visible: (opts.showCalendar || opts.showTime) && visible(), attr: { \'data-opts\': JSON.stringify(opts) } ">            <!-- ko if: opts.showCalendar -->            <table data-bind="css: { selected: value } " class="calendar-sheet">                <thead>                    <tr class="month-header">                        <th>                            <a href="#" data-bind="click: calendar.prev" class="prev">&laquo;</a>                        </th>                        <th data-bind="attr: { colspan: constants.daysInWeek - 2 } ">                            <b data-bind="text: opts.strings.months[current().getMonth()] + \' \' + current().getFullYear()"></b>                        </th>                        <th>                            <a href="#" data-bind="click: calendar.next" class="next">&raquo;</a>                        </th>                    </tr>                    <tr data-bind="foreach: opts.strings.days">                        <th data-bind="text: $data.substring(0, $parents[1].constants.dayStringLength)"></th>                    </tr>                </thead>                <tbody data-bind="foreach: calendar.sheet">                    <tr class="week" data-bind="foreach: $data">                        <td class="day" data-bind="css: { weekend: $parents[1].utils.date.isWeekend($data), today: $parents[1].utils.date.isSame(new Date(), $data), inactive: !($parents[1].utils.date.isSameMonth($parents[1].current(), $data)), outofrange: !($parents[1].utils.date.isWithinMinMaxDateRange($data)) } ">                            <a href="javascript:;" data-bind="text: $data.getDate(), attr: { title: $data }, click: $parents[1].calendar.select, css: { active: $parents[1].utils.date.isSame($parents[1].value(), $data) } "></a>                        </td>                    </tr>                </tbody>                <!-- ko if: opts.showToday -->                    <tfoot>                        <tr>                            <td data-bind="attr: { colspan: constants.daysInWeek } ">                                <a href="javascript:;" data-bind="click: calendar.selectToday">Today</a>                            </td>                        </tr>                    </tfoot>                <!-- /ko -->            </table>            <!-- /ko -->            <!-- ko if: opts.showTime -->            <table class="time-sheet">                <tbody>                    <tr data-bind="foreach: time.sheet">                        <td data-bind="css: { outofrange: $parent.utils.time.checkMaxTimeRange($data) }">                            <a href="#" class="up" data-bind="click: $parent.time.next"></a>                        </td>                    </tr>                    <tr data-bind="foreach: time.sheet">                        <td data-bind="css: { colon: $index() === 0, inactive: !$parent.value() }, text: $parent.time.text($data)"></td>                    </tr>                    <tr data-bind="foreach: time.sheet">                        <td data-bind="css: { outofrange: $parent.utils.time.checkMinTimeRange($data) }">                            <a href="#" class="down" data-bind="click: $parent.time.prev"></a>                        </td>                    </tr>                </tbody>                <!-- ko if: opts.showNow -->                    <tfoot>                        <tr>                            <td data-bind="attr: { colspan: time.sheet().length } ">                                <a href="javascript:;" data-bind="click: time.selectNow">Now</a>                            </td>                        </tr>                    </tfoot>                <!-- /ko -->            </table>            <!-- /ko -->        </div>',
      h = function h(a, d) {
    var e,
        h = new f(d);if ("INPUT" == a.tagName) {
      var i = b.createElement("div");i.innerHTML = g, e = i.children[0], b.body.appendChild(e), h.input(!0), h.visible(!1), c.utils.registerEventHandler(a, "focus", function (b) {
        setTimeout(function () {
          var b = h.utils.element.offset(a),
              c = h.utils.element.height(a),
              d = [window.innerWidth - e.offsetWidth - 20, b.left];e.style.position = "absolute", e.style.top = b.top + c + 5 + "px", e.style.left = Math.min.apply(null, d) + "px";
        }), h.visible(!0);
      }), c.utils.registerEventHandler(a, "keydown", function (a) {
        var b = { 9: !0, 27: !0, 46: !0, 13: !0 };a.which in b && h.visible(!1);
      }), c.utils.registerEventHandler(b, "mousedown", function (b) {
        b.target == a || b.target == e || h.utils.element.isDescendant(e, b.target) ? a.focus() : h.visible(!1);
      }), c.utils.registerEventHandler(a, "blur", function (a) {
        if ("" === a.target.value) return h.value(null);if (h.utils.date.isValid(a.target.value)) {
          var b = new Date(a.target.value);(null === h.value() || h.value() && h.value().getTime() !== b.getTime()) && h.value(b);
        }
      });
    } else a.innerHTML = g, e = a.children[0];c.applyBindings(h, e);
  };c.components.register(d, { viewModel: f, template: g }), c.bindingHandlers[d] = { init: function init(a, b) {
      return h(a, c.unwrap(b())), { controlsDescendantBindings: !0 };
    } }, c[d] = h;
});

},{}]},{},[4])