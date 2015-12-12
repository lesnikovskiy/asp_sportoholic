import ko from "knockout";
import router from "./Router";
import NavBar from "./components/nav-bar/nav-bar";
import HomePage from "./components/home-page/home";
import NewItem from "./components/new-item/new-item";
import AboutPage from "./components/about-page/about.html";

ko.components.register("nav-bar", NavBar);
ko.components.register("home-page", HomePage);
ko.components.register("new-item", NewItem);
ko.components.register("about-page", {template: AboutPage});

ko.applyBindings({ route: router.currentRoute });