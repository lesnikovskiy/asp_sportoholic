(function(root, factory) {

    // AMD / require.js
    if (typeof define === 'function' && define.amd) {
        define(['knockout'], function(ko) {
            factory.call(root, window, document, ko);
        });
    } else {
        factory.call(root, window, document, ko);
    }

})(this, function(win, doc, ko) {

    var binding = 'calendar';

    // Core utils
    var utils = {
        deepExtend: function(destination, source) {
            var property;
            for (property in source) {
                if (source[property] && source[property].constructor && source[property].constructor === Object) {
                    destination[property] = destination[property] || {};
                    utils.deepExtend(destination[property], source[property]);
                } else {
                    destination[property] = source[property];
                }
            }
            return destination;
        }
    };

    var Model = function(params) {
        var self = this;

        self.opts = {
            value: ko.observable(),
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
                months: [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ],
                days: [ "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" ],
                time: ["AM", "PM"]
            }
        };

        utils.deepExtend(self.opts, params);

        if(!self.opts.showCalendar && !self.opts.showTime) {
            return console.error('Silly goose, what are you using ko-%s for?', binding);
        }

        self.constants = {
            daysInWeek: 7,
            dayStringLength: 2
        };

        // Model utils
        self.utils = {

            date: {

                /**
                 * Takes a string and returns true/false depending on whether
                 * or not the date is valid
                 * @param  {String}  dateString The date string to attempt to parse
                 * @return {Boolean}            True if the date is valid, false otherwise
                 */
                isValid: function(dateString) {
                    var date = new Date(dateString);
                    if ( Object.prototype.toString.call(date) !== "[object Date]" ) {
                        return false;
                    }
                    return !isNaN(date.getTime());
                },

                /**
                 * Takes a given date and sets the time to midnight
                 * @param  {Date} d The date object to normalize
                 * @return {Date}   The normalized date
                 */
                normalize: function(d) {
                    var normalized = new Date(d.getTime());
                    normalized.setHours(0, 0, 0, 0);
                    return normalized;
                },

                /**
                 * Checks if two date objects are on the same day
                 * @param  {Date}  d1 The first date
                 * @param  {Date}  d2 The second date
                 * @return {Boolean}    Whether or not the dates share the same day
                 */
                isSame: function(d1, d2) {
                    if(!d1 || !d2) { return false; }
                    return (
                        (d1.getMonth() == d2.getMonth()) &&
                        (d1.getDate() == d2.getDate()) &&
                        (d1.getFullYear() == d2.getFullYear())
                    );
                },

                /**
                 * Checks if the two date objects have different months
                 * @param  {Date}  d1 The first date
                 * @param  {Date}  d2 The second date
                 * @return {Boolean}    Whether or not the dates share the same month
                 */
                isSameMonth: function(d1, d2) {
                    if(!d1 || !d2) { return false; }
                    return d1.getMonth() == d2.getMonth();
                },

                /**
                 * Checks if the given date falls on the weekend (Saturday or Sunday)
                 * @param  {Date}  d The date to check
                 * @return {Boolean}   Whether or not the date falls on a weekend
                 */
                isWeekend: function(d) {
                    if(!d) { return false; }
                    return d.getDay() === 0 || (d.getDay() == self.constants.daysInWeek - 1);
                },

                /**
                 * Check if the given date falls within the date range
                 * @param {Date} d The date to check
                 * @return {Boolean} Whether or not the date falls within the range
                 */
                isWithinMinMaxDateRange: function(d) {
                    if(!d) { return false; }
                    if(!self.opts.min && !self.opts.max) { return true; }

                    if(self.opts.min && self.utils.date.normalize(self.opts.min) > d) {
                        return false;
                    }
                    if(self.opts.max && self.utils.date.normalize(self.opts.max) < d) {
                        return false;
                    }

                    return true;
                }
            },
            time: {
                handleSuffixCheck: function(date) {
                    var hours = date.getHours();
                    if(hours >= 12) {
                        hours -= 12;
                    }
                    else if(hours < 12) {
                        hours += 12;
                    }
                    return date.setHours(hours);
                },
                checkMinTimeRange: function(data) {
                    if(!data || !self.value() || (!self.opts.min && !self.opts.max)) { return false; }

                    var d = new Date(self.value());

                    if(data.type === "hours") { d.setHours(d.getHours() - 1); }
                    else if(data.type === "minutes") { d.setMinutes(d.getMinutes() - 1); }
                    else if(data.type === "suffix") { d = self.utils.time.handleSuffixCheck(d); }

                    if(self.opts.max && self.opts.max < d) { return true; }
                    if(self.opts.min && self.opts.min > d) { return true; }

                    return false;
                },
                checkMaxTimeRange: function(data) {
                    if(!data || !self.value() || (!self.opts.min && !self.opts.max)) { return false; }

                    var d = new Date(self.value());

                    if(data.type === "hours") { d.setHours(d.getHours() + 1); }
                    else if(data.type === "minutes") { d.setMinutes(d.getMinutes() + 1); }
                    else if(data.type === "suffix") { d = new Date(self.utils.time.handleSuffixCheck(d)); }

                    if(self.opts.min && self.opts.min > d) { return true; }
                    if(self.opts.max && self.opts.max < d) { return true; }

                    return false;
                }
            },
            strings: {
                pad: function(n) {
                    return n < 10 ? "0" + n : n;
                }
            },
            element: {
                offset: function(el) {
                    var box = el.getBoundingClientRect();
                    var docEl = doc.documentElement;

                    return {
                        top: box.top + win.pageYOffset - docEl.clientTop,
                        left: box.left + win.pageXOffset - docEl.clientLeft
                    };
                },
                height: function(el) {
                    return el.offsetHeight;
                },
                isDescendant: function(parent, child) {
                    var node = child.parentNode;
                    while (node !== null) {
                        if (node == parent) {
                            return true;
                        }
                        node = node.parentNode;
                    }
                    return false;
                }
            }
        };

        // Date Alias Helpers
        self.current = ko.observable(self.opts.current || new Date()); // The current sheet Date

        if( !ko.isObservable(self.opts.value) ) {
            return console.error('value must be an observable');
        }

        self.value = self.opts.value; // The selected Date

        // Hide today button if the min is greater than today or max is less than today
        if(self.opts.showToday && !self.utils.date.isWithinMinMaxDateRange(self.utils.date.normalize(new Date()))) {
            self.opts.showToday = false;
        }
        // Hide now button if the current time is out of the min-max time range
        if(self.opts.showNow && ((self.opts.min && self.opts.min >= new Date()) || (self.opts.max && self.opts.max <= new Date()))) {
            self.opts.showNow = false;
        }

        self.calendar = {

            // Selects a date
            select: function(data, e) {
                if( self.opts.deselectable && self.utils.date.isSame(self.value(), data) ) {
                    return self.value(null);
                }
                if(self.opts.min && self.utils.date.isSame(data, self.opts.min)) {
                    self.value(new Date(self.opts.min));
                }
                else {
                    self.value(new Date(data));
                }

                if( self.input() && self.opts.autoclose ) {
                    self.visible(false);
                }
            },
            selectToday: function(data, e) {
                var d = self.utils.date.normalize(new Date());
                self.calendar.select(d);
                self.current(d);
            },
            next: function() {
                var cur = self.current();
                cur.setDate(1);
                cur.setMonth(cur.getMonth()+1);
                self.current(new Date(cur));
            },
            prev: function() {
                var cur = self.current();
                cur.setDate(1);
                cur.setMonth(cur.getMonth()-1);
                self.current(new Date(cur));
            },
            sheet: ko.computed(function() {

                // Current month set to the first day
                var normalized = self.utils.date.normalize(self.current());
                normalized.setDate(1);
                normalized.setDate(normalized.getDate() - normalized.getDay()); // Set our date to the first day of the week from the normalized month

                var weeks = [];
                var week = 0;
                var startedMonth = false;
                var completedMonth = false;
                var completedWeek = false;

                while(true) {
                    if(!weeks[week]) { weeks[week] = []; }

                    // If we haven't filled the current week up
                    if(weeks[week].length !== self.constants.daysInWeek) {

                        // Append to the week
                        weeks[week].push(new Date(normalized.getTime()));

                        // And increment the date
                        normalized.setDate( normalized.getDate() + 1 );
                    }

                    // If we've began working within the current month
                    if( normalized.getMonth() == self.current().getMonth() ) { startedMonth = true; }

                    // If we've started our current month and we've changed months (and thus completed it)
                    if( startedMonth && (normalized.getMonth() !== self.current().getMonth()) ) { completedMonth = true; }

                    // If we've completed our month and we are at the end of the week
                    if(completedMonth && weeks[week].length == self.constants.daysInWeek) { completedWeek = true; }

                    // If we've completed the month and our week
                    if(completedMonth && completedWeek) { break; }

                    // Otherwise, if we're at the end of the week, increment the current week
                    if(weeks[week].length == self.constants.daysInWeek) { week++; }
                }

                return weeks;
            })
        };

        self.time = {
            next: function(data, e) {
                if(!self.value()) { return self.time.selectNow(); }

                self.value( new Date( data.set( data.get()+1 ) ) );
            },
            prev: function(data, e) {
                if(!self.value()) { return self.time.selectNow(); }

                self.value( new Date( data.set( data.get()-1 ) ) );
            },
            selectNow: function() {
                var now = new Date();

                self.value(now);
                self.current(now);

                if( self.input() && self.opts.autoclose ) {
                    self.visible(false);
                }
            },
            sheet: ko.observableArray([
                {
                    type: 'hours',
                    get: function() { return self.value().getHours(); },
                    set: function(to) { return self.value().setHours(to); }
                },
                {
                    type: 'minutes',
                    get: function() { return self.value().getMinutes(); },
                    set: function(to) { return self.value().setMinutes(to); }
                }
            ]),
            text: function(data) {
                if(!self.value()) {
                    return '-';
                }

                switch(data.type) {
                    case 'suffix':
                        return data.get() ? self.opts.strings.time[1] : self.opts.strings.time[0];
                    case 'hours':
                        var hours = data.get();
                        if(!self.opts.militaryTime && (hours > 12 || hours === 0) ) {
                            hours -= 12;
                        }
                        return Math.abs(hours);
                    default:
                        return self.utils.strings.pad(data.get());
                }
            }

        };

        if(!self.opts.militaryTime) {
            self.time.sheet.push({
                type: 'suffix',
                get: function() {
                    if(self.value() && self.value().getHours() < 12 ) {
                        return 0;
                    }
                    return 1;
                },

                // This set function is special because we don't care about the `to` parameter
                set: function(to) {
                    var hours = self.value().getHours();
                    if(hours >= 12) {
                        hours -= 12;
                    }
                    else if(hours < 12) {
                        hours += 12;
                    }
                    return self.value().setHours( hours );
                }
            });
        }

        self.input = ko.observable(false); // Is binding attached to an imput?
        self.visible = ko.observable(true);
    };

    var Template =
        '<div class="ko-calendar" data-bind="with: $data, visible: (opts.showCalendar || opts.showTime) && visible(), attr: { \'data-opts\': JSON.stringify(opts) } ">\
            <!-- ko if: opts.showCalendar -->\
            <table data-bind="css: { selected: value } " class="calendar-sheet">\
                <thead>\
                    <tr class="month-header">\
                        <th>\
                            <a href="#" data-bind="click: calendar.prev" class="prev">&laquo;</a>\
                        </th>\
                        <th data-bind="attr: { colspan: constants.daysInWeek - 2 } ">\
                            <b data-bind="text: opts.strings.months[current().getMonth()] + \' \' + current().getFullYear()"></b>\
                        </th>\
                        <th>\
                            <a href="#" data-bind="click: calendar.next" class="next">&raquo;</a>\
                        </th>\
                    </tr>\
                    <tr data-bind="foreach: opts.strings.days">\
                        <th data-bind="text: $data.substring(0, $parents[1].constants.dayStringLength)"></th>\
                    </tr>\
                </thead>\
                <tbody data-bind="foreach: calendar.sheet">\
                    <tr class="week" data-bind="foreach: $data">\
                        <td class="day" data-bind="css: { weekend: $parents[1].utils.date.isWeekend($data), today: $parents[1].utils.date.isSame(new Date(), $data), inactive: !($parents[1].utils.date.isSameMonth($parents[1].current(), $data)), outofrange: !($parents[1].utils.date.isWithinMinMaxDateRange($data)) } ">\
                            <a href="javascript:;" data-bind="text: $data.getDate(), attr: { title: $data }, click: $parents[1].calendar.select, css: { active: $parents[1].utils.date.isSame($parents[1].value(), $data) } "></a>\
                        </td>\
                    </tr>\
                </tbody>\
                <!-- ko if: opts.showToday -->\
                    <tfoot>\
                        <tr>\
                            <td data-bind="attr: { colspan: constants.daysInWeek } ">\
                                <a href="javascript:;" data-bind="click: calendar.selectToday">Today</a>\
                            </td>\
                        </tr>\
                    </tfoot>\
                <!-- /ko -->\
            </table>\
            <!-- /ko -->\
            <!-- ko if: opts.showTime -->\
            <table class="time-sheet">\
                <tbody>\
                    <tr data-bind="foreach: time.sheet">\
                        <td data-bind="css: { outofrange: $parent.utils.time.checkMaxTimeRange($data) }">\
                            <a href="#" class="up" data-bind="click: $parent.time.next"></a>\
                        </td>\
                    </tr>\
                    <tr data-bind="foreach: time.sheet">\
                        <td data-bind="css: { colon: $index() === 0, inactive: !$parent.value() }, text: $parent.time.text($data)"></td>\
                    </tr>\
                    <tr data-bind="foreach: time.sheet">\
                        <td data-bind="css: { outofrange: $parent.utils.time.checkMinTimeRange($data) }">\
                            <a href="#" class="down" data-bind="click: $parent.time.prev"></a>\
                        </td>\
                    </tr>\
                </tbody>\
                <!-- ko if: opts.showNow -->\
                    <tfoot>\
                        <tr>\
                            <td data-bind="attr: { colspan: time.sheet().length } ">\
                                <a href="javascript:;" data-bind="click: time.selectNow">Now</a>\
                            </td>\
                        </tr>\
                    </tfoot>\
                <!-- /ko -->\
            </table>\
            <!-- /ko -->\
        </div>';

    var applyCalendar = function(el, opts) {

        var instance = new Model(opts);
        var cal;

        if( el.tagName == "INPUT" ) {

            // Create our template
            var temp = doc.createElement('div');
            temp.innerHTML = Template;
            cal = temp.children[0];
            doc.body.appendChild(cal);

            instance.input(true);
            instance.visible(false);

            // Position Calendar
            ko.utils.registerEventHandler(el, 'focus', function(e) {

                // Push this to the end of the stack so we can get the cal width
                setTimeout(function() {
                    var offset = instance.utils.element.offset(el);
                    var height = instance.utils.element.height(el);
                    var positions = [window.innerWidth - cal.offsetWidth - 20, offset.left];

                    cal.style.position = "absolute";
                    cal.style.top = (offset.top + height + 5) + 'px';
                    cal.style.left = (Math.min.apply(null, positions)) + 'px';
                });

                // Mark as visible
                instance.visible(true);
            });

            // Kill input/calendar focus
            ko.utils.registerEventHandler(el, 'keydown', function(e) {
                // User has pressed tab
                var cancellers = {
                    9: true, // tab
                    27: true, // escape
                    46: true, // delete
                    13: true // enter
                };
                if( e.which in cancellers ) {
                    instance.visible(false);
                }
            });

            // Clicking outside of an input
            ko.utils.registerEventHandler(doc, 'mousedown', function(e) {
                if(!(
                    e.target == el ||
                    e.target == cal ||
                    instance.utils.element.isDescendant(cal, e.target)
                )) {
                    instance.visible(false);
                } else {
                    el.focus();
                }
            });

            // Unset observable upon certain values
            ko.utils.registerEventHandler(el, 'blur', function(e) {

                if(e.target.value === "") {
                    return instance.value(null);
                }

                if( instance.utils.date.isValid(e.target.value) ) {
                    var newDate = new Date(e.target.value);

                    if( instance.value() === null ||
                        (instance.value() && instance.value().getTime() !== newDate.getTime())
                    ) {
                        instance.value(newDate);
                    }
                }
            });

        } else {
            el.innerHTML = Template;
            cal = el.children[0]; // The first node in our Template
        }

        ko.applyBindings(instance, cal);
    };

    // Component
    ko.components.register(binding, {
        viewModel: Model,
        template: Template
    });

    // Binding
    ko.bindingHandlers[binding] = {
        init: function(el, opts) {

            applyCalendar(el, ko.unwrap(opts()));

            return {
                controlsDescendantBindings: true
            };
        }
    };

    // JS API
    ko[binding] = applyCalendar;
});
