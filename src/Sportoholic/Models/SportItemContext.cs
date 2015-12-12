using Microsoft.Data.Entity;

namespace Sportoholic.Models
{
	/* See how to generate migration https://ef.readthedocs.org/en/latest/getting-started/aspnet5/new-db.html */
	//$ dnvm list
	//$ dnvm use 1.0.0-rc1-update1
	//$ dnx ef migrations add Initial
	//$ dnx ef database update
	public class SportItemContext : DbContext
	{
		public DbSet<SportItem> SportItems { get; set; }

		protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
		{
			base.OnConfiguring(optionsBuilder);
		}

		protected override void OnModelCreating(ModelBuilder modelBuilder)
		{
			base.OnModelCreating(modelBuilder);
		}
	}
}
