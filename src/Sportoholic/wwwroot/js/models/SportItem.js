import ko from "knockout";

export default class SportItem {
	constructor(params) {
		this.id = ko.observable(params.Id);
		this.weight = ko.observable(params.Weight);
		this.walking = ko.observable(params.Walking);
		this.workout = ko.observable(params.Workout);
		this.description = ko.observable(params.Description);
		this.date = ko.observable(params.Date);
	}
}