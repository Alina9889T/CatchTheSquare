namespace CatchTheSquare
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);
            var app = builder.Build();

            app.UseDefaultFiles();
            app.UseStaticFiles();

            app.MapGet("/api/user/{id:long}", RequestHandlers.GetUserAsync);
            app.MapPost("/api/user", RequestHandlers.SaveUserAsync);
            app.MapPost("/api/score", RequestHandlers.SaveScoreAsync);
            app.MapPost("/api/theme", RequestHandlers.SaveThemeAsync);

            app.Run();
        }
    }
}
