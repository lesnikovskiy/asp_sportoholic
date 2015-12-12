import ko from "knockout";
import $ from "jquery";
import SportItem from "../../models/SportItem";
import hasher from "hasher";
import koCalendar from "ko-calendar";
import template from "./new-item.html";

class NewItem {
	constructor() {
		this.newItem = ko.observable(new SportItem({Id: 0, Weight: null, Walking: false, Workout: false, Description: null, Date: null}));
		this.opts = {
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
				months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
				days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
				time: ["AM", "PM"]
			}
		};
	}

	save() {
		$.ajax({
			url: "api/sportoholic",
			type: "POST",
			data: ko.toJSON(this),
			dataType: "json",
			contentType: "application/json"
		}).done(() => {
			hasher.setHash("home-page");
		});
	}
}

export default {
	viewModel: NewItem,
	template: template
}