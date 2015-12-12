# ko-calendar

A simple datetime picker built with knockout.

[View a demo here](http://makerstudios.github.io/ko-calendar/demo/)

***

- [Features](#features)
- [Installing & Building](#installing--building)
- [Usage](#usage)
- [API](#api)
- [Default Options](#default-options)
- [FAQ](#faq)
- [Screenshot](#screenshot)
- [Contributing](#contributing)
- [License](LICENSE)

# Features
* Only dependency is Knockout.js
* Lightweight, ~8kb JS, ~4kb CSS
* Simple, Terse, [Legible](https://github.com/MakerStudios/ko-calendar/blob/develop/src/js/ko-calendar.js) (looking at any other datepicker)
* Supports Components, Bindings, and a plain JS API
* Cross browser compatible. Thanks, [Knockout!](https://github.com/knockout/knockout)


# Installing & Building
```sh
$ npm install
$ npm run-script bower # To download Knockout if needed

$ npm run-script build # Compiles source
$ npm run-script build-watch # Compiles and watches source for changes
```

# Usage
ko-calendar depends on Knockout.js 3.2.0+
```html
<head>
	<link href="ko-calendar.min.css" rel="stylesheet" type="text/css">
	<script src="knockout.js" type="text/javascript"></script>
	<script src="ko-calendar.min.js" type="text/javascript"></script>
</head>
```

# API
ko-calendar supports Components and bindings.

### Component
```html
<div data-bind="component: { name: 'calendar', params: opts }"></div>
```

### Inline Binding
```html
<div data-bind="calendar: opts"></div>
```

### Input Binding
```html
<input type="text" data-bind="calendar: opts">
```

### JS API
```javascript
ko.calendar(document.getElementById('calendar'), opts);
```

# Default Options
```javascript
var opts = {
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
```
All options are deeply extended, allowing you to only specify the options you wish to override.
<table>
	<thead>
		<tr>
			<th>Option</th>
			<th>Type</th>
			<th>Default</th>
			<th>Description</th>
		</tr>
	</thead>
	<tbody>
		<tr>
			<td>value</td>
			<td>Observable</td>
			<td>ko.observable([Date Object])</td>
			<td>An observable of the selected date</td>
		</tr>
		<tr>
			<td>current</td>
			<td>Date</td>
			<td>new Date()</td>
			<td>The date of the sheet being currently viewed</td>
		</tr>
		<tr>
			<td>deselectable</td>
			<td>Boolean</td>
			<td>true</td>
			<td>Allows a selected date to be clicked again to be deselected</td>
		</tr>
		<tr>
			<td>showCalendar</td>
			<td>Boolean</td>
			<td>true</td>
			<td>Show or hide the date selecter</td>
		</tr>
		<tr>
			<td>showToday</td>
			<td>Boolean</td>
			<td>true</td>
			<td>If showCalender is true, shows a button below the calendar that allows the user to quickly select the current day</td>
		</tr>
		<tr>
			<td>showTime</td>
			<td>Boolean</td>
			<td>true</td>
			<td>Show or hide the time selecter</td>
		</tr>
		<tr>
			<td>showNow</td>
			<td>Boolean</td>
			<td>true</td>
			<td>If showTime is true, shows a button below the time that allows the user to quickly select the current time</td>
		</tr>
		<tr>
			<td>militaryTime</td>
			<td>Boolean</td>
			<td>false</td>
			<td>If true, the time format will be 24 hour, but if false, the time format will be 12 hour with support for periods (AM/PM)</td>
		</tr>
		<tr>
			<td>min</td>
			<td>Date</td>
			<td>null</td>
			<td>A Date object that enforces the calendar &apm; time cannot be set before this date</td>
		</tr>
		<tr>
			<td>max</td>
			<td>Date</td>
			<td>null</td>
			<td>A Date object that enforces the calendar &apm; time cannot be set after this date</td>
		</tr>
		<tr>
			<td>autoclose</td>
			<td>Boolean</td>
			<td>true</td>
			<td>If true, the calendar will close when bound to an input the user selects a date</td>
		</tr>
		<tr>
			<td>strings</td>
			<td>Object</td>
			<td>...</td>
			<td>An object that specifies all strings used for the calendar, useful for localization. Any of the keys within this object may be included.</td>
		</tr>
	</tbody>
</table>

# FAQ
**How do I set the initial date being viewed on the calendar?**
- The current "sheet" being viewed at any point reflects the date set in the `opts.current` variable. When a user paginates months/years, this date changed with it.

**How can I set the initial selected date of the calendar?**
- The current date selected is an observable and can be found in `opts.value`. Normally, you'd provide your own observable in this field so you can capture the value of the calendar within your code.

**I want to use this as an input binding but some of my options aren't being set**
- ko-calendar is meant to be used in conjunction with other bindings. For example, if you want the value of the input to be the value in the calendar:
```html
<input type="text" data-bind="value: myDate, calendar: { value: myDate } ">
```
- You must set the `value` binding in conjunction with the `calendar` binding.

**Selecting a date doesn't close the picker, what gives?**
- Set `opts.autoclose` to `true` to dismiss the calendar _when a date_ has been selected.

# Screenshot
<img src="http://i.imgur.com/at52A0H.png" width="235">

# Contributing
Contributions to the project are most welcome, so feel free to fork and improve. When submitting a pull request, please run `grunt jshint` (or `npm run-script build`) first to ensure common issues have been caught.

# License
The MIT License (MIT) Copyright (c) 2015 Maker Studios
