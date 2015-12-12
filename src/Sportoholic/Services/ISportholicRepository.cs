using System.Collections.Generic;
using Sportoholic.Models;

namespace Sportoholic.Services
{
	public interface ISportholicRepository
	{
		IEnumerable<SportItem> GetItems();
		void AddItem(SportItem sportItem);
	}
}