using System.Linq;
using System.Collections.Generic;
using Microsoft.AspNet.Mvc;
using Sportoholic.Services;
using Sportoholic.ViewModels;

namespace Sportoholic.Controllers
{
	[Route("api/[controller]")]
	public class SportoholicController : Controller
	{
		private readonly ISportholicRepository _repository;

		public SportoholicController(ISportholicRepository repository)
		{
			_repository = repository;
		}

		[HttpGet]
		public IEnumerable<SportItemModel> Get()
		{
			return _repository.GetItems().Select(i => i.ToSportModel());
		}

		[HttpPost]
		public void Post([FromBody] SportItemModel sportItemModel)
		{
			_repository.AddItem(sportItemModel.ToSportItem());
		}
	}
}