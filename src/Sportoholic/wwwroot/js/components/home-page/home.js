import ko from "knockout";
import $ from "jquery";
import SportItem from "../../models/SportItem";
import template from "./home.html";

class HomeViewModel {
	constructor(params) {
		this.message = ko.observable('Welcome to ko-browserify!');
		this.sportItems = ko.observableArray();

		$.ajax({
			type: "GET",
			url: "api/sportoholic",
			cache: false,
			dataType: 'json',
			contentType: 'application/json'
		}).done((data) => {
			this.sportItems(data.map(function(i) {
				return new SportItem(i);
			}));
		});
	}
	
	doSomething() {
		this.message('You invoked doSomething() on the viewmodel.');
	}
}

export default {
	viewModel: HomeViewModel,
	template: template
}
