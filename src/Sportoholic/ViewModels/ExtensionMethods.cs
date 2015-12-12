using System;
using Sportoholic.Models;

namespace Sportoholic.ViewModels
{
	public static class ExtensionMethods
	{
		public static SportItemModel ToSportModel(this SportItem item)
		{
			return new SportItemModel
			{
				Id = item.Id,
				Weight = item.Weight,
				Walking = item.Walking,
				Workout = item.Workout,
				Description = item.Description,
				Date = item.Date.ToString("s")
			};
		}

		public static SportItem ToSportItem(this SportItemModel item)
		{
			return new SportItem
			{
				Id = item.Id,
				Weight = item.Weight,
				Walking = item.Walking,
				Workout = item.Workout,
				Description = item.Description,
				Date = DateTime.Parse(item.Date)
			};
		}
	}
}
