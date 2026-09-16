namespace CatchTheSquare.Models
{
    public class UserModel
    {
        public long Id { get; set; }
        public string? Username { get; set; }
        public int BestScore { get; set; }
        public string Theme { get; set; } = "dark";
    }
}
