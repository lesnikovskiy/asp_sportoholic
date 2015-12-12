using System.Collections.Generic;
using System.Linq;
using Sportoholic.Models;

namespace Sportoholic.Services
{
	public class SportoholicRepository : ISportholicRepository
	{
		private readonly SportItemContext _context; 

		public SportoholicRepository(SportItemContext context)
		{
			_context = context;
		}

		public IEnumerable<SportItem> GetItems()
		{
			return _context.SportItems.OrderBy(q => q.Date).ToList();
		}

		public void AddItem(SportItem sportItem)
		{
			_context.SportItems.Add(sportItem);
			_context.SaveChanges();
		}
	}
}