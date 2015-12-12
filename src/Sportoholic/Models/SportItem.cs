using System;

namespace Sportoholic.Models
{
	public class SportItem
	{
		public int Id { get; set; }
		public int Weight { get; set; }
		public bool Walking { get; set; }
		public bool Workout { get; set; }
		public string Description { get; set; }
		public DateTime Date { get; set; }
	}
}