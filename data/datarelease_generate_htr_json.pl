#!/usr/bin/perl

use JSON;
use strict;

# This script simply generates JSON files for each time integration
# of a particular named source, using uvspec.

my $sourcename = $ARGV[0];
#my $epname = $ARGV[1];

my $json = JSON->new;

my @dirs = &findsources($sourcename);

for (my $i = 0; $i <= $#dirs; $i++) {
    print $dirs[$i]."\n";
}

sub findsources {
    my $s = shift;
    my @dirs = map { chomp(my $a = $_); $a =~ s/^\.\///; $a =~ s/\.[^\.]*$//; $a } `find . -path "./v3_redo/*/$s.*/visdata"`;
    
    my @sdirs = sort @dirs;

    for (my $i = 0; $i < $#sdirs; $i++) {
	if ($sdirs[$i] eq $sdirs[$i + 1]) {
	    splice @sdirs, ($i + 1), 1;
	    $i--;
	}
    }

    return @sdirs;
}
